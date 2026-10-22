import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ZodType } from 'zod';
import { chunkByWords } from '../src/chunk.js';
import { findAnchor, isGrounded } from '../src/grounding.js';
import { PROVIDERS } from '../src/llm/config.js';
import {
  DEFAULT_RUBRIC,
  cardGeneratePrompt,
  cardHelpPrompt,
  itemDialoguePrompt,
  essayGlobalPrompt,
  essayParagraphsPrompt,
  gradeAnswerPrompt,
  numberParagraphs,
  type EssayInput,
} from '../src/llm/prompts.js';
import { AllProvidersFailedError, complete, type CompleteResult } from '../src/llm/router.js';
import { CardGenerate, CardHelp, EssayGlobal, EssayParagraphs, GradeAnswer, ItemDialogue, type FeedbackItem } from '../src/llm/schemas.js';
import type { CallLog, ProviderConfig, TaskName } from '../src/llm/types.js';
import { rankFeedback } from '../src/rank.js';

export interface EvalOptions {
  samplesDir: string;
  outDir: string;
  env: Record<string, string | undefined>;
  /** Pin one provider so results compare models, not the router's failover mix. */
  providerId?: string;
  completeFn?: typeof complete;
  log?: (msg: string) => void;
}

export interface SummaryRow {
  task: TaskName;
  sample: string;
  status: 'ok' | 'failed' | 'skipped_empty';
  provider: string;
  model: string;
  latency_ms: number;
  items: number;
  anchors_dropped: number;
  cards: number;
  cards_grounded: number;
}

const COLUMNS: (keyof SummaryRow)[] = [
  'task', 'sample', 'status', 'provider', 'model', 'latency_ms', 'items', 'anchors_dropped', 'cards', 'cards_grounded',
];
const CHUNK_WORDS = 3000;

async function listTxt(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith('.txt')).sort();
  } catch {
    return [];
  }
}

const csvCell = (v: unknown) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export async function runEval(o: EvalOptions): Promise<SummaryRow[]> {
  const completeFn = o.completeFn ?? complete;
  const say = o.log ?? console.log;
  let providers: ProviderConfig[] | undefined;
  if (o.providerId) {
    const p = PROVIDERS[o.providerId];
    if (!p) throw new Error(`Unknown provider "${o.providerId}". Valid: ${Object.keys(PROVIDERS).join(', ')}`);
    providers = [p];
  }

  await mkdir(o.outDir, { recursive: true });
  const rows: SummaryRow[] = [];
  const calls: string[] = [];

  const row = (task: TaskName, sample: string, extra: Partial<SummaryRow> = {}): SummaryRow => {
    const r: SummaryRow = { task, sample, status: 'ok', provider: '', model: '', latency_ms: 0, items: 0, anchors_dropped: 0, cards: 0, cards_grounded: 0, ...extra };
    rows.push(r);
    say(`${task} ${sample}: ${r.status}${r.provider ? ` (${r.provider})` : ''}`);
    return r;
  };
  const record = (sample: string, log: CallLog[]) => log.forEach((l) => calls.push(JSON.stringify({ sample, ...l })));

  /** Run one call; failures become a 'failed' row instead of stopping the run. */
  async function call<T>(task: TaskName, sample: string, prompt: { system: string; user: string }, schema: ZodType<T>): Promise<CompleteResult<T> | null> {
    try {
      const r = await completeFn(task, prompt, schema, { env: o.env, providers, requireNoTraining: false });
      record(sample, r.log);
      return r;
    } catch (e) {
      if (!(e instanceof AllProvidersFailedError)) throw e;
      record(sample, e.log);
      row(task, sample, { status: 'failed' });
      say(`  ${e.message}`);
      return null;
    }
  }
  const meta = (r: CompleteResult<unknown>) => ({
    provider: r.provider,
    model: r.model,
    latency_ms: r.log.reduce((s, l) => s + l.latencyMs, 0),
  });

  // Essays: global + paragraph passes, anchored and ranked.
  const weights = Object.fromEntries(DEFAULT_RUBRIC.map((c) => [c.name, c.weight]));
  let dialogueDone = false;
  for (const name of await listTxt(join(o.samplesDir, 'essays'))) {
    const raw = await readFile(join(o.samplesDir, 'essays', name), 'utf8');
    if (!raw.trim()) {
      say(`warning: ${name} is empty, skipped`);
      row('essay_global', name, { status: 'skipped_empty' });
      continue;
    }
    const m = raw.match(/^Prompt:\s*(.*)\r?\n/);
    const input: EssayInput = {
      essay: m ? raw.slice(m[0].length) : raw,
      assignmentPrompt: m?.[1],
      gradeLevel: 'college',
      essayType: 'argumentative',
    };
    const paragraphs = numberParagraphs(input.essay);
    const anchor = (items: FeedbackItem[]) => {
      const kept = [];
      const dropped = [];
      for (const it of items) {
        const para = paragraphs[it.paragraph_index];
        const a = para === undefined ? null : findAnchor(para, it.quote);
        if (a) kept.push({ ...it, anchor: a });
        else dropped.push(it);
      }
      return { kept, dropped };
    };

    const g = await call('essay_global', name, essayGlobalPrompt(input), EssayGlobal);
    const p = await call('essay_paragraphs', name, essayParagraphsPrompt(input), EssayParagraphs);
    const ga = anchor(g?.data.items ?? []);
    const pa = anchor(p?.data.items ?? []);
    if (g) row('essay_global', name, { ...meta(g), items: ga.kept.length, anchors_dropped: ga.dropped.length });
    if (p) row('essay_paragraphs', name, { ...meta(p), items: pa.kept.length, anchors_dropped: pa.dropped.length });

    const ranked = rankFeedback([...ga.kept, ...pa.kept], weights);

    // Item dialogue (A3.10) once, as a dispute on the first essay's top item, so the token budget covers it.
    const top = ranked[0];
    if (top && !dialogueDone) {
      dialogueDone = true;
      const message = 'I think this part is fine, because my next paragraph explains it.';
      const d = await call('item_dialogue', name, itemDialoguePrompt({ gradeLevel: input.gradeLevel,
        item: { summary: top.summary, quote: top.quote, category: top.category }, paragraph: paragraphs[top.paragraph_index] ?? input.essay,
        history: [], kind: 'dispute', message }), ItemDialogue);
      if (d) {
        row('item_dialogue', name, meta(d));
        await mkdir(join(o.outDir, 'item_dialogue'), { recursive: true });
        await writeFile(join(o.outDir, 'item_dialogue', `${name}.json`), JSON.stringify({ item: top, message, result: d.data }, null, 2));
      }
    }
    await mkdir(join(o.outDir, 'essay'), { recursive: true });
    await writeFile(
      join(o.outDir, 'essay', `${name}.json`),
      JSON.stringify(
        {
          strengths: g?.data.strengths ?? [],
          rubric_scores: g?.data.rubric_scores ?? [],
          prompt_alignment: g?.data.prompt_alignment ?? null,
          outline: p?.data.outline ?? [],
          top3: ranked.slice(0, 3),
          items: ranked,
          dropped: [...ga.dropped, ...pa.dropped],
        },
        null,
        2,
      ),
    );
  }

  // Documents: card generation per chunk, each card checked for grounding.
  for (const name of await listTxt(join(o.samplesDir, 'docs'))) {
    const chunks = chunkByWords(await readFile(join(o.samplesDir, 'docs', name), 'utf8'), CHUNK_WORDS);
    if (!chunks.length) {
      say(`warning: ${name} is empty, skipped`);
      row('card_generate', name, { status: 'skipped_empty' });
      continue;
    }
    const cards = [];
    let last: CompleteResult<CardGenerate> | null = null;
    let latency = 0;
    let failed = false;
    for (const chunk of chunks) {
      const r = await call('card_generate', name, cardGeneratePrompt({ chunk, subject: 'general', level: 'college' }), CardGenerate);
      if (!r) {
        failed = true;
        continue;
      }
      last = r;
      latency += meta(r).latency_ms;
      cards.push(...r.data.cards.map((c) => ({ ...c, grounded: isGrounded(chunk, c.source_quote) })));
    }
    // A failed chunk already added a 'failed' row; only report ok when every chunk succeeded.
    if (!failed && last) {
      row('card_generate', name, { ...meta(last), latency_ms: latency, cards: cards.length, cards_grounded: cards.filter((c) => c.grounded).length });
    }
    await mkdir(join(o.outDir, 'card_generate'), { recursive: true });
    await writeFile(join(o.outDir, 'card_generate', `${name}.json`), JSON.stringify({ cards }, null, 2));

    // Card help (B3.3/B3.8) on the first card, so the token budget covers it; split cards must quote the chunk.
    const first = cards[0];
    if (first) {
      const h = await call('card_help', name, cardHelpPrompt({ front: first.front, back: first.back, keyPoints: first.key_points, chunk: chunks[0] }), CardHelp);
      if (h) {
        const split = h.data.split.map((c) => ({ ...c, grounded: isGrounded(chunks[0], c.source_quote) }));
        row('card_help', name, { ...meta(h), cards: split.length, cards_grounded: split.filter((c) => c.grounded).length });
        await mkdir(join(o.outDir, 'card_help'), { recursive: true });
        await writeFile(join(o.outDir, 'card_help', `${name}.json`), JSON.stringify({ card: first, help: { ...h.data, split } }, null, 2));
      }
    }
  }

  // Answers: semantic grading.
  let answers: { question: string; reference: string; keyPoints: string[]; answer: string }[] = [];
  try {
    answers = JSON.parse(await readFile(join(o.samplesDir, 'answers.json'), 'utf8'));
  } catch {
    // no answers file: nothing to grade
  }
  for (const [i, a] of answers.entries()) {
    const name = `answers.json#${i}`;
    if (!a.answer?.trim()) {
      row('grade_answer', name, { status: 'skipped_empty' });
      continue;
    }
    const r = await call('grade_answer', name, gradeAnswerPrompt(a), GradeAnswer);
    if (!r) continue;
    row('grade_answer', name, meta(r));
    await mkdir(join(o.outDir, 'grade_answer'), { recursive: true });
    await writeFile(join(o.outDir, 'grade_answer', `${i}.json`), JSON.stringify({ input: a, result: r.data }, null, 2));
  }

  if (calls.length) await appendFile(join(o.outDir, 'calls.jsonl'), calls.join('\n') + '\n');
  await writeFile(
    join(o.outDir, 'summary.csv'),
    [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n',
  );
  return rows;
}
