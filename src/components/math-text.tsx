'use client';

import { useEffect, useState } from 'react';

export type MathPart = { text: string } | { math: string; display: boolean };

// $$…$$ and \[…\] are display math; \(…\) and $…$ inline. A lone $ follows Pandoc's rule (no space inside either
// delimiter, no digit right after the closing one), so prices like "$5 and $10" stay text.
const MATH = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<![\\$])\$(?=\S)((?:\\\$|[^$\n])+?)(?<=\S)\$(?!\d)/g;

export function splitMath(text: string): MathPart[] {
  const parts: MathPart[] = [];
  let last = 0;
  for (const m of text.matchAll(MATH)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ math: m[1] ?? m[2] ?? m[3] ?? m[4], display: m[1] !== undefined || m[2] !== undefined });
    last = m.index + m[0].length;
  }
  if (last < text.length || !parts.length) parts.push({ text: text.slice(last) });
  return parts;
}

// A cloze card stores its hidden part as {{c1::text}} or {{c1::text::hint}} in the question; it is never shown.
const CLOZE = /\{\{c\d+::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;
const BLANK = '_____';

/** The question as plain text, with each hidden part as a blank (for text that isn't rendered by MathText). */
export const blankCloze = (text: string) => text.replace(CLOZE, (_, _hidden, hint?: string) => (hint ? `${BLANK} (${hint})` : BLANK));

/** Text with each cloze drawn as a blank that screen readers read as "blank". */
function withBlanks(text: string) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(CLOZE)) {
    out.push(text.slice(last, m.index));
    out.push(<span key={m.index}><span className="sr-only">blank</span><span aria-hidden="true">{BLANK}</span>{m[2] ? ` (${m[2]})` : ''}</span>);
    last = m.index + m[0].length;
  }
  if (!out.length) return text;
  out.push(text.slice(last));
  return out;
}

type Katex = typeof import('katex').default;
let loaded: Katex | null = null; // shared, so cards mounted after the first load render math straight away

/** B7: card text with formulas rendered. KaTeX (and its CSS) loads only for text that has math. */
export function MathText({ text }: { text: string }) {
  const parts = splitMath(text);
  const hasMath = parts.some((p) => 'math' in p);
  const [katex, setKatex] = useState<Katex | null>(loaded);

  useEffect(() => {
    if (!hasMath || katex) return;
    let live = true;
    void Promise.all([import('katex'), import('katex/dist/katex.min.css')])
      .then(([k]) => { loaded = k.default; if (live) setKatex(() => k.default); })
      .catch(() => {}); // offline and not cached: the TeX source stays readable as text
    return () => { live = false; };
  }, [hasMath, katex]);

  if (!hasMath || !katex) return <>{withBlanks(text)}</>;
  return (
    <>
      {parts.map((p, i) => ('math' in p
        // KaTeX escapes its input and, with trust off (the default), emits no links or scripts.
        ? <span key={i} dangerouslySetInnerHTML={{ __html: katex.renderToString(p.math, { displayMode: p.display, throwOnError: false, output: 'htmlAndMathml' }) }} />
        : <span key={i}>{withBlanks(p.text)}</span>))}
    </>
  );
}
