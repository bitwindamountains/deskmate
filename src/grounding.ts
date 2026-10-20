const FOLD: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '‚': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '–': '-',
  '—': '-',
  '‑': '-',
};

/**
 * Normalize one char at a time and record, for each output char, the index of the
 * original char it came from. Whitespace runs collapse to one space; leading whitespace is dropped.
 */
function normalizeWithMap(s: string): { text: string; map: number[] } {
  let text = '';
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      if (text.length > 0 && text[text.length - 1] !== ' ') {
        text += ' ';
        map.push(i);
      }
      continue;
    }
    for (const out of ch.normalize('NFKC')) {
      text += FOLD[out] ?? out;
      map.push(i);
    }
  }
  return { text, map };
}

export function normalizeText(s: string): string {
  return normalizeWithMap(s).text.trimEnd();
}

/** Locate a model-supplied quote in the original paragraph; offsets index the original text. */
export function findAnchor(paragraph: string, quote: string): { start: number; end: number } | null {
  if (!quote.trim()) return null;
  const exact = paragraph.indexOf(quote);
  if (exact >= 0) return { start: exact, end: exact + quote.length };
  const q = normalizeText(quote);
  const { text, map } = normalizeWithMap(paragraph);
  const at = text.indexOf(q);
  if (at < 0) return null;
  return { start: map[at], end: map[at + q.length - 1] + 1 };
}

/** A card is grounded when its source quote appears in the chunk (after normalization). */
export function isGrounded(chunk: string, quote: string): boolean {
  const q = normalizeText(quote);
  return q.length > 0 && normalizeText(chunk).includes(q);
}
