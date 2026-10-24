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

type Katex = typeof import('katex').default;

/** B7: card text with formulas rendered. KaTeX (and its CSS) loads only for text that has math. */
export function MathText({ text }: { text: string }) {
  const parts = splitMath(text);
  const hasMath = parts.some((p) => 'math' in p);
  const [katex, setKatex] = useState<Katex | null>(null);

  useEffect(() => {
    if (!hasMath || katex) return;
    let live = true;
    void Promise.all([import('katex'), import('katex/dist/katex.min.css')])
      .then(([k]) => { if (live) setKatex(() => k.default); })
      .catch(() => {}); // offline and not cached: the TeX source stays readable as text
    return () => { live = false; };
  }, [hasMath, katex]);

  if (!hasMath || !katex) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) => ('math' in p
        // KaTeX escapes its input and, with trust off (the default), emits no links or scripts.
        ? <span key={i} dangerouslySetInnerHTML={{ __html: katex.renderToString(p.math, { displayMode: p.display, throwOnError: false, output: 'htmlAndMathml' }) }} />
        : p.text))}
    </>
  );
}
