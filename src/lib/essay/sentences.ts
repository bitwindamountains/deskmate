/** Sentence spans in a paragraph (for read-aloud), as trimmed [start, end) offsets. Uses the platform's sentence segmenter. */
export function splitSentences(paragraph: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const { segment, index } of new Intl.Segmenter('en', { granularity: 'sentence' }).segment(paragraph)) {
    const lead = segment.length - segment.trimStart().length;
    const text = segment.trim();
    if (text) out.push({ start: index + lead, end: index + lead + text.length });
  }
  return out;
}
