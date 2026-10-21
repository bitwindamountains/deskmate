// Sentence-level feedback without an LLM (spec §6.2): the free LanguageTool public API.
// ponytail: the public API allows about 20 requests a minute, shared by every Scholar user; self-host LanguageTool once 429s show up.
const ENDPOINT = 'https://api.languagetool.org/v2/check';

// Dialect fairness (brief E3): only rules about clear errors, never style. Convention rules are labelled, not called errors.
const KEEP = new Set(['TYPOS', 'GRAMMAR', 'PUNCTUATION', 'CONFUSED_WORDS', 'REDUNDANCY']);
const CONVENTION = new Set(['PUNCTUATION', 'REDUNDANCY']);
const SEP = '\n\n';

export type SentenceItem = { paragraph_index: number; quote: string; start: number; end: number; category: string;
  summary: string; replacements: string[]; convention: boolean };
type Match = { message: string; offset: number; length: number; replacements: { value: string }[]; rule: { category: { id: string } } };

export class LanguageToolUnavailable extends Error {
  constructor() {
    super('LanguageTool is unavailable');
    this.name = 'LanguageToolUnavailable';
  }
}

export async function checkSentences(paras: string[], indices: number[], fetchFn: typeof fetch = fetch): Promise<SentenceItem[]> {
  if (!indices.length) return [];
  // One request for all paragraphs; starts[k] is where paras[indices[k]] begins in the joined text.
  const starts: number[] = [];
  let at = 0;
  for (const i of indices) { starts.push(at); at += paras[i].length + SEP.length; }
  const text = indices.map((i) => paras[i]).join(SEP);

  let matches: Match[];
  try {
    const res = await fetchFn(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ text, language: 'en-US', level: 'default' }).toString(),
    });
    if (!res.ok) throw new LanguageToolUnavailable();
    matches = ((await res.json()) as { matches?: Match[] }).matches ?? [];
  } catch {
    throw new LanguageToolUnavailable(); // never surface the provider's error text
  }

  return matches.flatMap((m) => {
    const category = m.rule?.category?.id;
    if (!KEEP.has(category)) return [];
    const k = starts.filter((s) => s <= m.offset).length - 1; // starts ascend, so this is the last paragraph starting at or before the match
    const p = indices[k];
    const start = m.offset - starts[k];
    const end = start + m.length;
    if (k < 0 || end > paras[p].length) return []; // a match across the paragraph separator has no single anchor
    return [{ paragraph_index: p, quote: paras[p].slice(start, end), start, end, category, summary: m.message,
      replacements: m.replacements.slice(0, 3).map((r) => r.value), convention: CONVENTION.has(category) }];
  });
}
