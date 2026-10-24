import { DAILY_GENERATIONS } from '@/lib/generate/limits';
import type { Db } from '@/lib/llm-calls';

const DAILY_ESSAY_CHECKS = 5; // matches c_daily_limit in scholar_private.consume_essay_quota

/** Spec §6.5: what's left of a daily quota today (UTC day, like the quota functions). RLS scopes the row to the student. */
async function left(db: Db, column: 'essays' | 'generations', limit: number, what: string): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const { data, error } = await db.from('quota_usage').select(column).eq('day', day).maybeSingle();
  if (error) throw new Error(`We couldn't load your ${what}.`);
  return Math.max(0, limit - ((data as Record<string, number> | null)?.[column] ?? 0));
}

export const essayChecksLeft = (db: Db) => left(db, 'essays', DAILY_ESSAY_CHECKS, 'essay checks');
export const generationsLeft = (db: Db) => left(db, 'generations', DAILY_GENERATIONS, 'card generations');
