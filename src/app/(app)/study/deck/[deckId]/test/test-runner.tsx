'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { writeHref } from '@/growth/prompts';
import { gradeLocally } from '@/review/grade';
import type { TestQuestion } from '@/review/practice-test';
import { MathText } from '@/components/math-text';

type Outcome = { q: TestQuestion; right: boolean };

/** B4.4: one question at a time; nothing here touches the review schedule. Typed answers are graded on the device. */
export function TestRunner({ deckId, deckTitle, questions }: { deckId: string; deckTitle: string; questions: TestQuestion[] }) {
  const [i, setI] = useState(0);
  const [pick, setPick] = useState('');
  const [text, setText] = useState('');
  const [unsure, setUnsure] = useState(false); // the cascade couldn't settle a typed answer
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Outcome[]>([]);
  const heading = useRef<HTMLElement>(null);
  const gotIt = useRef<HTMLButtonElement>(null);
  // Keyboard and screen-reader users land on each new question, and on the result, instead of losing focus to the page.
  useEffect(() => { if (i > 0) heading.current?.focus(); }, [i]);
  useEffect(() => { if (unsure) gotIt.current?.focus(); }, [unsure]);

  if (questions.length === 0) {
    return (
      <section className="max-w-prose space-y-4">
        <p>Add at least 2 cards to make a test.</p>
        <Link href={`/study/deck/${deckId}`} className="btn">Back to the deck</Link>
      </section>
    );
  }

  const record = (right: boolean) => {
    setDone((d) => [...d, { q: questions[i], right }]);
    setI((n) => n + 1);
    setPick(''); setText(''); setUnsure(false);
  };

  async function next() {
    const q = questions[i];
    if (q.kind === 'choice') return record(pick === q.answer);
    setBusy(true);
    // No embedder and no LLM in a practice test: whatever exact and fuzzy matching can't settle, the student marks.
    const g = await gradeLocally({ type: q.type, reference: q.answer, keyPoints: q.keyPoints, answer: text, responseMs: 10_000 }, null);
    setBusy(false);
    // Only a sure match counts by itself; a paraphrase can score low and still be right, so everything else is self-marked.
    if (g.source === 'exact' || g.score >= 0.85) record(true);
    else setUnsure(true);
  }

  if (i >= questions.length) {
    const right = done.filter((o) => o.right).length;
    const missed = done.filter((o) => !o.right);
    return (
      <section aria-labelledby="result-h" className="max-w-prose space-y-4">
        <h2 id="result-h" ref={heading as React.RefObject<HTMLHeadingElement>} tabIndex={-1} className="sr-only">Your result</h2>
        <p className="text-xl font-bold">{`${right} of ${done.length} right`}</p>
        {missed.length > 0 && (
          <>
            <h3 className="font-bold">Worth another look</h3>
            <ul className="space-y-3 [overflow-wrap:anywhere]">
              {missed.map((o) => (
                <li key={o.q.cardId} className="rounded-xl border border-line bg-surface p-4">
                  <p className="font-bold"><MathText text={o.q.prompt} /></p>
                  <p>Answer: <MathText text={o.q.answer} /></p>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="flex flex-wrap gap-3">
          <Link href={`/study/deck/${deckId}`} className="btn">Back to the deck</Link>
          {missed[0] && <Link href={writeHref(deckTitle, `Explain in one paragraph (at least 50 words): ${missed[0].q.prompt}`)} className="btn">Explain one in writing</Link>}
        </div>
      </section>
    );
  }

  const q = questions[i];
  return (
    <section aria-label="Practice test" className="max-w-xl space-y-5">
      <p ref={heading as React.RefObject<HTMLParagraphElement>} tabIndex={-1} className="text-sm font-bold text-ink-muted outline-none">{`Question ${i + 1} of ${questions.length}`}</p>
      <form className="space-y-4 rounded-xl border border-line bg-surface p-5 [overflow-wrap:anywhere]" onSubmit={(e) => { e.preventDefault(); void next(); }}>
        {q.kind === 'choice' ? (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-[1.44rem] leading-snug font-bold"><MathText text={q.prompt} /></legend>
            {q.choices!.map((c) => (
              <label key={c} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line px-3">
                <input type="radio" name={`q-${i}`} value={c} checked={pick === c} onChange={() => setPick(c)} />
                <span><MathText text={c} /></span>
              </label>
            ))}
          </fieldset>
        ) : (
          <>
            <h2 className="text-[1.44rem] leading-snug font-bold"><MathText text={q.prompt} /></h2>
            <label htmlFor="test-answer" className="block font-bold">Your answer</label>
            <textarea id="test-answer" rows={3} className="field" value={text} disabled={unsure} onChange={(e) => setText(e.target.value)} />
          </>
        )}
        {unsure ? (
          <div role="status" className="space-y-3">
            <p className="font-bold">Check this one yourself</p>
            <p><MathText text={q.answer} /></p>
            <div className="flex flex-wrap gap-3">
              <button ref={gotIt} type="button" className="btn" onClick={() => record(true)}>I got it right</button>
              <button type="button" className="btn" onClick={() => record(false)}>I missed it</button>
            </div>
          </div>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={busy || (q.kind === 'choice' ? !pick : !text.trim())}>Next</button>
        )}
      </form>
    </section>
  );
}
