'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Rating } from 'ts-fsrs';
import { writeHref } from '@/growth/prompts';
import { gradeLocally } from '@/review/grade';
import type { TestQuestion } from '@/review/practice-test';

type Outcome = { q: TestQuestion; right: boolean };

/** B4.4: one question at a time; nothing here touches the review schedule. Typed answers are graded on the device. */
export function TestRunner({ deckId, deckTitle, questions }: { deckId: string; deckTitle: string; questions: TestQuestion[] }) {
  const [i, setI] = useState(0);
  const [pick, setPick] = useState('');
  const [text, setText] = useState('');
  const [unsure, setUnsure] = useState(false); // the cascade couldn't settle a typed answer
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Outcome[]>([]);

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
    if (g.needsLlm) setUnsure(true);
    else record(g.suggested >= Rating.Good);
  }

  if (i >= questions.length) {
    const right = done.filter((o) => o.right).length;
    const missed = done.filter((o) => !o.right);
    return (
      <section aria-labelledby="result-h" className="max-w-prose space-y-4">
        <h2 id="result-h" className="sr-only">Your result</h2>
        <p className="text-xl font-bold">{`${right} of ${done.length} right`}</p>
        {missed.length > 0 && (
          <>
            <h3 className="font-bold">Worth another look</h3>
            <ul className="space-y-3 [overflow-wrap:anywhere]">
              {missed.map((o) => (
                <li key={o.q.cardId} className="rounded-xl border border-line bg-surface p-4">
                  <p className="font-bold">{o.q.prompt}</p>
                  <p>{`Answer: ${o.q.answer}`}</p>
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
      <p className="text-sm font-bold text-ink-muted">{`Question ${i + 1} of ${questions.length}`}</p>
      <form className="space-y-4 rounded-xl border border-line bg-surface p-5 [overflow-wrap:anywhere]" onSubmit={(e) => { e.preventDefault(); void next(); }}>
        {q.kind === 'choice' ? (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-[1.44rem] leading-snug font-bold">{q.prompt}</legend>
            {q.choices!.map((c) => (
              <label key={c} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line px-3">
                <input type="radio" name={`q-${i}`} value={c} checked={pick === c} onChange={() => setPick(c)} />
                <span>{c}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <>
            <h2 className="text-[1.44rem] leading-snug font-bold">{q.prompt}</h2>
            <label htmlFor="test-answer" className="block font-bold">Your answer</label>
            <textarea id="test-answer" rows={3} className="field" value={text} disabled={unsure} onChange={(e) => setText(e.target.value)} />
          </>
        )}
        {unsure ? (
          <div role="status" className="space-y-3">
            <p className="font-bold">Check this one yourself</p>
            <p>{q.answer}</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn" onClick={() => record(true)}>I got it right</button>
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
