import { allRows } from '@/lib/cards/all-rows';
import type { Db } from '@/lib/llm-calls';

// Every scholar table that holds a student's rows, with its key so paging is stable. Read through RLS, so only the caller's rows.
const TABLES: Record<string, string[]> = {
  profiles: ['user_id'], decks: ['id'], sources: ['id'], source_chunks: ['id'], cards: ['id'], card_states: ['card_id'],
  reviews: ['id'], grade_cache: ['card_id', 'answer_hash'], card_aids: ['card_id'], concept_prereqs: ['id'],
  essays: ['id'], drafts: ['id'], analyses: ['draft_id'], feedback_items: ['id'], feedback_events: ['id'],
  feedback_messages: ['id'], self_assessments: ['draft_id'], problem_reports: ['id'], quota_usage: ['day'], llm_calls: ['id'],
};

type Row = Record<string, unknown>;

/** Brief E4: everything the student has in Scholar, one array per table. Null when any table fails to load. */
export async function exportMyData(db: Db): Promise<Record<string, Row[]> | null> {
  const tables = await Promise.all(Object.entries(TABLES).map(async ([table, keys]) => {
    const rows = await allRows<Row>((from, to) => keys.reduce((q, k) => q.order(k), db.from(table).select('*')).range(from, to));
    // Embeddings are 384 numbers per card that the device recomputes; they would make the file mostly noise.
    return rows && [table, rows.map(({ embedding: _, ...r }) => r)] as const;
  }));
  return tables.every(Boolean) ? Object.fromEntries(tables as [string, Row[]][]) : null;
}
