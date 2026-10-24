import { wordCount } from '@/chunk';
import { findAnchor, normalizeText } from '@/grounding';
import { numberParagraphs } from '@/llm/prompts';
import { looksEnglish } from './english';

export const ESSAY_TYPES = ['argumentative', 'expository', 'narrative', 'compare-contrast', 'research', 'personal-statement'] as const;
export type EssayType = (typeof ESSAY_TYPES)[number];
export const MIN_WORDS = 50, MAX_WORDS = 2000, MAX_PARAGRAPHS = 40;
/** localStorage key prefix for unsent essay edits (editor.tsx); sign-out wipes every key with it. */
export const ESSAY_DRAFT_PREFIX = 'scholar-essay-draft-';

// Same split the prompt uses, so [Pn] labels and stored indices agree.
export const paragraphs = (content: string): string[] => numberParagraphs(content);

/** SHA-256 hex of the normalized paragraph, so whitespace and curly-quote edits don't count as changes. */
export async function paragraphHash(p: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeText(p)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function validateEssay(content: string): { ok: true; words: number } | { ok: false; error: string } {
  const words = wordCount(content);
  if (words < MIN_WORDS) return { ok: false, error: 'Add a little more: feedback needs at least 50 words.' };
  if (words > MAX_WORDS) {
    return {
      ok: false,
      error: `This essay is ${words.toLocaleString('en-US')} words. Draft Coach handles up to 2,000 words for now; paste one section at a time.`,
    };
  }
  if (paragraphs(content).length > MAX_PARAGRAPHS) {
    return { ok: false, error: "That's a lot of paragraphs. Join short ones and try again." };
  }
  if (!looksEnglish(content)) {
    return { ok: false, error: "This doesn't look like English. Draft Coach gives feedback on essays written in English only." };
  }
  return { ok: true, words };
}

export type Anchor = { paragraph_index: number; start: number; end: number };

/** Models often get paragraph_index wrong, so fall back to searching every paragraph. */
export function anchorQuote(paras: string[], hintIndex: number, quote: string): Anchor | null {
  const others = paras.map((_, i) => i).filter((i) => i !== hintIndex);
  for (const i of [hintIndex, ...others]) {
    if (paras[i] === undefined) continue;
    const hit = findAnchor(paras[i], quote);
    if (hit) return { paragraph_index: i, ...hit };
  }
  return null;
}
