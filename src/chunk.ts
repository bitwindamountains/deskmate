import { numberParagraphs } from './llm/prompts';

export const CHUNK_WORDS = 1500; // smaller than Phase 0's 3000 so cards stream sooner and stay within free-tier output limits

export interface PageText { page: number; text: string }
export interface Chunk { position: number; pageStart: number; pageEnd: number; text: string }

export const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

/** Fewer than 20 words in total means a scan (or an empty paste), not selectable text. */
export const hasTextLayer = (pages: PageText[]): boolean =>
  pages.reduce((sum, p) => sum + wordCount(p.text), 0) >= 20;

/** Split on blank lines and pack paragraphs into chunks of at most maxWords; an oversize paragraph stays whole. */
export function chunkByWords(text: string, maxWords: number): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let words = 0;
  for (const para of numberParagraphs(text)) {
    const n = para.split(/\s+/).length;
    if (current.length && words + n > maxWords) {
      chunks.push(current.join('\n\n'));
      current = [];
      words = 0;
    }
    current.push(para);
    words += n;
  }
  if (current.length) chunks.push(current.join('\n\n'));
  return chunks;
}

/** Pack whole pages in order; a page alone over maxWords is split by words into consecutive chunks. */
export function chunkPages(pages: PageText[], maxWords: number): Chunk[] {
  const chunks: Chunk[] = [];
  let cur: { start: number; end: number; texts: string[]; words: number } | null = null;
  const flush = () => {
    if (cur) chunks.push({ position: chunks.length, pageStart: cur.start, pageEnd: cur.end, text: cur.texts.join('\n\n') });
    cur = null;
  };
  for (const { page, text } of pages) {
    const t = text.trim();
    if (!t) continue;
    const n = wordCount(t);
    if (n > maxWords) {
      flush();
      const words = t.split(/\s+/);
      for (let i = 0; i < words.length; i += maxWords) {
        chunks.push({ position: chunks.length, pageStart: page, pageEnd: page, text: words.slice(i, i + maxWords).join(' ') });
      }
      continue;
    }
    if (cur && cur.words + n > maxWords) flush();
    if (!cur) cur = { start: page, end: page, texts: [], words: 0 };
    cur.end = page;
    cur.texts.push(t);
    cur.words += n;
  }
  flush();
  return chunks;
}
