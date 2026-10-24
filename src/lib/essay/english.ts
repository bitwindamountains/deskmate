// The most common English function words. Real English prose is full of them, even dense academic writing;
// other languages (including Spanish and Filipino, which share some spellings) use almost none.
const FUNCTION_WORDS = new Set(('the of and to a in is that it for on with as are was this be by not or have from they their which '
  + 'an at but we you he she his her its were been has had can will would should could may also these those there than then into '
  + 'more most other some such when who what how all our your them so if do does did about upon within').split(' '));

/** A7, English only: true when the text reads as English. Deterministic, so it runs before any AI call. */
export function looksEnglish(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (!words.length) return false;
  const hits = words.filter((w) => FUNCTION_WORDS.has(w)).length;
  // ponytail: one threshold, measured on the samples in tests/lib/english.test.ts; tune if real essays get refused.
  return hits / words.length >= 0.12;
}
