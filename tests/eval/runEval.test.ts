import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test, vi } from 'vitest';
import { runEval } from '../../eval/runEval.js';
import { AllProvidersFailedError } from '../../src/llm/router.js';

const ESSAY = 'Prompt: Should schools ban phones?\nSchools should ban phones because they distract students.\n\nStudies show focus improves without phones.';

const globalData = {
  strengths: [
    { paragraph_index: 0, quote: 'Schools should ban phones', why: 'clear position' },
    { paragraph_index: 1, quote: 'Studies show', why: 'cites evidence' },
  ],
  rubric_scores: [{ criterion: 'Thesis', score: 3, justification: 'j', confidence: 'high' }],
  items: [
    item('global', 'thesis', 0, 'Schools should ban phones', 'high'),
    item('global', 'counterargument', 0, 'this quote is not in the essay', 'medium'),
  ],
};
const paragraphData = {
  items: [item('paragraph', 'evidence', 1, 'Studies show focus improves', 'medium'), item('paragraph', 'analysis', 0, 'distract students', 'low')],
};
const cardData = {
  cards: [
    { type: 'basic', front: 'What makes ATP?', back: 'Mitochondria', key_points: ['mitochondria'], source_quote: 'Mitochondria produce ATP', concept: 'c', bloom_level: 'remember', importance: 2 },
    { type: 'basic', front: 'Q2', back: 'A2', key_points: [], source_quote: 'not in the source', concept: 'c', bloom_level: 'remember', importance: 2 },
  ],
};
const gradeData = { score: 0.8, hit: ['k'], missed: [], misconception: null, feedback: 'Nice.', suggested_rating: 'good' };

function item(layer: string, category: string, paragraph_index: number, quote: string, severity: string) {
  return { layer, category, rubric_criterion: 'Thesis', paragraph_index, quote, severity, summary: 's', hints: ['q', 'h'] };
}
const ok = (data: unknown, task: string) => ({
  data,
  provider: 'groq',
  model: 'm',
  log: [{ task, provider: 'groq', model: 'm', status: 'ok', tokensIn: 1, tokensOut: 1, latencyMs: 5 }],
});
const helpData = { explanation: 'e', mnemonic: 'm', analogy: 'a', split: [
  { type: 'basic', front: 'f1', back: 'b', key_points: [], source_quote: 'produce ATP', concept: 'c', bloom_level: 'remember' },
  { type: 'basic', front: 'f2', back: 'b', key_points: [], source_quote: 'not in the doc', concept: 'c', bloom_level: 'remember' },
] };
const byTask: Record<string, unknown> = { essay_global: globalData, essay_paragraphs: paragraphData, card_generate: cardData, grade_answer: gradeData, card_help: helpData };

let dir: string;
let fake: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'eval-'));
  await mkdir(join(dir, 'samples/essays'), { recursive: true });
  await mkdir(join(dir, 'samples/docs'), { recursive: true });
  fake = vi.fn(async (task: string) => ok(byTask[task], task));
});

const opts = () => ({ samplesDir: join(dir, 'samples'), outDir: join(dir, 'out'), env: {}, completeFn: fake as any, log: () => {} });

test('empty essay file is skipped with a warning and no call', async () => {
  await writeFile(join(dir, 'samples/essays/blank.txt'), '  \n\n ');
  const log = vi.fn();
  const rows = await runEval({ ...opts(), log });
  expect(rows.find((r) => r.sample === 'blank.txt')!.status).toBe('skipped_empty');
  expect(fake).not.toHaveBeenCalled();
  expect(log.mock.calls.flat().join(' ')).toMatch(/blank\.txt.*empty/i);
});

test('essay item whose quote is not in the paragraph is dropped and counted', async () => {
  await writeFile(join(dir, 'samples/essays/e1.txt'), ESSAY);
  const rows = await runEval(opts());
  const g = rows.find((r) => r.task === 'essay_global')!;
  expect(g).toMatchObject({ status: 'ok', items: 1, anchors_dropped: 1, provider: 'groq' });
  expect(rows.find((r) => r.task === 'essay_paragraphs')).toMatchObject({ items: 2, anchors_dropped: 0 });
});

test('assignment prompt line is passed to the prompt, not treated as essay text', async () => {
  await writeFile(join(dir, 'samples/essays/e1.txt'), ESSAY);
  await runEval(opts());
  const [, prompt] = fake.mock.calls.find(([t]) => t === 'essay_global')!;
  expect(prompt.user).toContain('<assignment>\nShould schools ban phones?');
  expect(prompt.user).toContain('[P0] Schools should ban phones');
});

test('essay output has top3 ranked items', async () => {
  await writeFile(join(dir, 'samples/essays/e1.txt'), ESSAY);
  await runEval(opts());
  const out = JSON.parse(await readFile(join(dir, 'out/essay/e1.txt.json'), 'utf8'));
  expect(out.top3).toHaveLength(3);
  expect(out.top3[0]).toMatchObject({ category: 'thesis', priority_rank: 1, anchor: { start: 0, end: 25 } });
  expect(out.dropped).toHaveLength(1);
});

test('card with ungrounded source_quote counts in cards but not cards_grounded', async () => {
  await writeFile(join(dir, 'samples/docs/d1.txt'), 'Mitochondria produce ATP for the cell.');
  const rows = await runEval(opts());
  expect(rows.find((r) => r.task === 'card_generate')).toMatchObject({ sample: 'd1.txt', status: 'ok', cards: 2, cards_grounded: 1 });
});

test('card help runs on the first generated card and its split cards are checked for grounding', async () => {
  await writeFile(join(dir, 'samples/docs/d1.txt'), 'Mitochondria produce ATP for the cell.');
  const rows = await runEval(opts());
  expect(rows.find((r) => r.task === 'card_help')).toMatchObject({ sample: 'd1.txt', status: 'ok', cards: 2, cards_grounded: 1 });
  expect(fake.mock.calls.filter((c) => c[0] === 'card_help')).toHaveLength(1);
});

test('answers.json entries are graded, blank answers skipped', async () => {
  await writeFile(
    join(dir, 'samples/answers.json'),
    JSON.stringify([
      { question: 'Q', reference: 'R', keyPoints: ['k'], answer: 'a' },
      { question: 'Q', reference: 'R', keyPoints: ['k'], answer: ' ' },
    ]),
  );
  const rows = await runEval(opts());
  expect(rows.filter((r) => r.task === 'grade_answer').map((r) => r.status)).toEqual(['ok', 'skipped_empty']);
});

test('AllProvidersFailedError gives a failed row and the run continues', async () => {
  await writeFile(join(dir, 'samples/essays/e1.txt'), ESSAY);
  await writeFile(join(dir, 'samples/docs/d1.txt'), 'Mitochondria produce ATP.');
  fake.mockImplementation(async (task: string) => {
    if (task === 'essay_global')
      throw new AllProvidersFailedError('all failed', [{ task: 'essay_global', provider: 'groq', model: 'm', status: 'rate_limited', tokensIn: 0, tokensOut: 0, latencyMs: 1 }]);
    return ok(byTask[task], task);
  });
  const rows = await runEval(opts());
  expect(rows.find((r) => r.task === 'essay_global')!.status).toBe('failed');
  expect(rows.find((r) => r.task === 'card_generate')!.status).toBe('ok');
  expect(await readFile(join(dir, 'out/calls.jsonl'), 'utf8')).toContain('rate_limited');
});

test('writes summary.csv with header and one line per row, and calls.jsonl', async () => {
  await writeFile(join(dir, 'samples/essays/e1.txt'), ESSAY);
  const rows = await runEval(opts());
  const csv = (await readFile(join(dir, 'out/summary.csv'), 'utf8')).trim().split('\n');
  expect(csv[0]).toBe('task,sample,status,provider,model,latency_ms,items,anchors_dropped,cards,cards_grounded');
  expect(csv).toHaveLength(rows.length + 1);
  const calls = (await readFile(join(dir, 'out/calls.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  expect(calls).toHaveLength(2);
  expect(calls[0]).toMatchObject({ sample: 'e1.txt', status: 'ok' });
});

test('unknown providerId throws listing valid ids', async () => {
  await expect(runEval({ ...opts(), providerId: 'nope' })).rejects.toThrow(/groq.*ollama/);
});

test('providerId pins one provider', async () => {
  await writeFile(join(dir, 'samples/docs/d1.txt'), 'Mitochondria produce ATP.');
  await runEval({ ...opts(), providerId: 'ollama' });
  const [, , , o] = fake.mock.calls[0];
  expect(o.providers.map((p: { id: string }) => p.id)).toEqual(['ollama']);
});
