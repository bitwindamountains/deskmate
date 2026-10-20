/** End index (inclusive) of the balanced JSON value opening at `start`, skipping brackets inside strings; -1 if unbalanced. */
function balancedEnd(s: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Parse JSON from model output that may be fenced or wrapped in prose. Throws SyntaxError if none is found. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1].trim());
  // Prose may contain "[P1]"-style labels, so try a balanced value from both the first '{' and the first '['.
  for (const open of ['{', '[']) {
    const start = trimmed.indexOf(open);
    const end = start >= 0 ? balancedEnd(trimmed, start) : -1;
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
