import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { wordCount } from '@/chunk';
import { anchorQuote, paragraphHash, paragraphs } from '@/lib/essay/text';
import { applyRating, makeScheduler, type Grade, type StateRow } from '@/review/schedule';
import { DEMO_DECKS, DEMO_ESSAY } from './content';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the schema generic differs between clients
type Db = SupabaseClient<any, any, any>;
const DAY_MS = 86_400_000;
const must = <T,>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> => {
  if (r.error || r.data === null) throw new Error(`demo seed: ${what}: ${r.error?.message ?? 'no data'}`);
  return r.data as NonNullable<T>;
};

/** Fills a fresh demo account. db must bypass RLS (secret key); every row carries userId. */
export async function seedDemo(db: Db, userId: string, now = new Date()): Promise<void> {
  const at = (daysAgo: number, hour = 17) => { const d = new Date(now.getTime() - daysAgo * DAY_MS); d.setUTCHours(hour, 0, 0, 0); return d; };
  must(await db.from('profiles').insert({ user_id: userId, display_name: 'Demo student', adult_attested_at: now.toISOString(),
    onboarded_at: now.toISOString(), study_minutes_per_day: 20, preferences: { show_scores: true } }).select('user_id'), 'profile');

  const scheduler = makeScheduler(false);
  const states: StateRow[] = [];
  const reviews: Record<string, unknown>[] = [];
  for (const deck of DEMO_DECKS) {
    const examDate = deck.examInDays === null ? null : new Date(now.getTime() + deck.examInDays * DAY_MS);
    const deckId = must(await db.from('decks').insert({ user_id: userId, title: deck.title, subject: deck.subject, goals: deck.goals ?? '',
      exam_date: examDate?.toISOString().slice(0, 10) ?? null }).select('id').single(), 'deck').id as string;
    const sourceId = must(await db.from('sources').insert({ user_id: userId, deck_id: deckId, title: deck.sourceTitle, kind: 'text', page_count: 1,
      card_density: 'standard', card_types: ['basic', 'cloze', 'why'] }).select('id').single(), 'source').id as string;
    const chunks = must(await db.from('source_chunks').insert(deck.notes.map((text, position) =>
      ({ user_id: userId, source_id: sourceId, position, text, generated_at: now.toISOString() }))).select('id,text'), 'chunks') as { id: string; text: string }[];

    const rows = deck.cards.map((c) => ({ id: randomUUID(), user_id: userId, deck_id: deckId,
      source_chunk_id: (chunks.find((ch) => ch.text.includes(c.quote)) ?? chunks[0]).id, type: c.type, front: c.front, back: c.back,
      key_points: c.keyPoints, source_quote: c.quote, concept: c.concept, bloom_level: c.bloom, importance: c.importance,
      status: c.history === null ? 'pending' : 'kept' }));
    must(await db.from('cards').insert(rows).select('id'), 'cards');

    deck.cards.forEach((c, i) => {
      let state: StateRow | null = null;
      for (const [daysAgo, rating] of c.history ?? []) {
        const when = at(daysAgo, 16 + (i % 5));
        state = applyRating({ id: rows[i].id, deckId, type: c.type, importance: c.importance, state }, rating as Grade, when, examDate, scheduler).state;
        reviews.push({ client_review_id: randomUUID(), card_id: rows[i].id, user_id: userId, grade_source: 'self', final_rating: rating,
          suggested_rating: rating, response_ms: 6000 + ((i * 1777) % 9000), reviewed_at: when.toISOString() });
      }
      if (state) states.push(state);
    });
  }
  if (states.length) must(await db.from('card_states').insert(states.map((s) => ({ ...s, user_id: userId }))).select('card_id'), 'card states');
  if (reviews.length) must(await db.from('reviews').insert(reviews).select('id'), 'reviews');

  const e = DEMO_ESSAY;
  const essayId = must(await db.from('essays').insert({ user_id: userId, title: e.title, essay_type: e.type, grade_level: e.gradeLevel,
    assignment_prompt: e.prompt }).select('id').single(), 'essay').id as string;
  const paras = paragraphs(e.content);
  const draftId = must(await db.from('drafts').insert({ user_id: userId, essay_id: essayId, version: 1, content: e.content,
    word_count: wordCount(e.content), paragraph_hashes: await Promise.all(paras.map(paragraphHash)),
    layers: { global: 'done', paragraphs: 'done', sentences: 'done' }, quota_consumed_at: at(1).toISOString(), outline: e.outline,
    created_at: at(1).toISOString() }).select('id').single(), 'draft').id as string;

  const anchor = (index: number, quote: string) => {
    const a = anchorQuote(paras, index, quote);
    if (!a) throw new Error(`demo seed: quote not in essay: ${quote}`);
    return a;
  };
  must(await db.from('analyses').insert({ draft_id: draftId, user_id: userId, rubric_scores: e.rubricScores, safety_concern: false,
    prompt_alignment: e.promptAlignment,
    strengths: e.strengths.map((s) => { const a = anchor(s.paragraph_index, s.quote); return { ...s, paragraph_index: a.paragraph_index, start: a.start, end: a.end }; }),
  }).select('draft_id'), 'analysis');
  must(await db.from('feedback_items').insert(e.items.map((it) => {
    const a = anchor(it.paragraph_index, it.quote);
    return { user_id: userId, draft_id: draftId, layer: it.layer, category: it.category, rubric_criterion: it.rubric_criterion,
      paragraph_index: a.paragraph_index, quote: it.quote, anchor_start: a.start, anchor_end: a.end, severity: it.severity, summary: it.summary,
      hints: it.hints, replacements: 'replacements' in it ? it.replacements : [], convention: 'convention' in it && it.convention,
      source: it.layer === 'sentence' ? 'languagetool' : 'llm', status: 'open', highest_level: 0 };
  })).select('id'), 'feedback');
}
