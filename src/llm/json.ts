/** Parse JSON from model output that may be fenced or wrapped in prose. Throws SyntaxError if none is found. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1].trim());
  const start = trimmed.search(/[[{]/);
  if (start >= 0) {
    const close = trimmed[start] === '{' ? '}' : ']';
    const end = trimmed.lastIndexOf(close);
    if (end > start) candidates.push(trimmed.slice(start, end + 1));
  }
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // try the next candidate
    }
  }
  throw new SyntaxError('No JSON found in model output');
}
