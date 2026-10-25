'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MathText } from '@/components/math-text';
import { buildWarmUp, type FormatCard, type Matching, type TrueFalse } from '@/review/formats';

/** A quick-fire round before review. It never writes a review or touches FSRS: true or false is a coin flip half the time. */
export function WarmUp({ cards, seed }: { cards: FormatCard[]; seed: number }) {
  const [items] = useState(() => buildWarmUp(cards, seed));
  const [i, setI] = useState(0);
  const [right, setRight] = useState(0);
  const total = items.reduce((n, x) => n + (x.kind === 'tf' ? 1 : x.pairs.length), 0);

  if (!items.length) {
    return (
      <section className="max-w-prose rounded-xl border border-line bg-surface p-6">
        <h2 className="text-xl font-bold text-balance">A warm-up needs at least 2 cards.</h2>
        <Link href="/study" className="btn mt-6">Back to Study</Link>
      </section>
    );
  }

  if (i >= items.length) {
    return (
      <section className="max-w-prose rounded-xl border border-line bg-surface p-6">
        <h2 className="text-xl font-bold text-balance">Warm-up done: {right} of {total} right.</h2>
        <p className="mt-2 text-ink-muted">The warm-up doesn&apos;t change when your cards come up. Review does.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/study/review" className="btn btn-primary">Start review</Link>
          <Link href="/study" className="btn">Back to Study</Link>
        </div>
      </section>
    );
  }

  const item = items[i];
  const next = (got: number) => { setRight((r) => r + got); setI((n) => n + 1); };
  return (
    <div className="max-w-xl space-y-6">
      <p className="text-sm font-bold text-ink-muted">Question {i + 1} of {items.length}</p>
      {item.kind === 'tf' ? <TrueFalseCard key={i} item={item} onNext={next} /> : <MatchCard key={i} item={item} onNext={next} />}
    </div>
  );
}

function TrueFalseCard({ item, onNext }: { item: TrueFalse; onNext: (right: number) => void }) {
  const [said, setSaid] = useState<boolean | null>(null);
  const correct = said === item.isTrue;
  return (
    <section aria-label="True or false" className="space-y-5 rounded-xl border border-line bg-surface p-5 [overflow-wrap:anywhere]">
      <h2 className="text-[1.44rem] leading-snug font-bold text-balance"><MathText text={item.prompt} /></h2>
      <div>
        <h3 className="text-sm font-bold text-ink-muted">Answer</h3>
        <p className="mt-1"><MathText text={item.shown} /></p>
      </div>
      {said === null ? (
        <div role="group" aria-label="Is this answer right?" className="flex flex-wrap gap-3">
          <button type="button" className="btn" onClick={() => setSaid(true)}>True</button>
          <button type="button" className="btn" onClick={() => setSaid(false)}>False</button>
        </div>
      ) : (
        <div className="space-y-3">
          <div role="status">
            <p className="font-bold">{correct ? 'Right.' : 'Not quite.'}</p>
            {!item.isTrue && <p className="mt-1">The answer is: <MathText text={item.answer} /></p>}
          </div>
          <button type="button" className="btn btn-primary" autoFocus onClick={() => onNext(correct ? 1 : 0)}>Next</button>
        </div>
      )}
    </section>
  );
}

/** Tap a question, then its answer. A pair counts as right only when it is matched on the first try. */
function MatchCard({ item, onNext }: { item: Matching; onNext: (right: number) => void }) {
  const [picked, setPicked] = useState<string | null>(null); // card id of the chosen question
  const [matched, setMatched] = useState<string[]>([]);
  const [missed, setMissed] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const done = matched.length === item.pairs.length;

  function choose(back: string) {
    if (!picked) { setNote('Pick a question first.'); return; }
    const pair = item.pairs.find((p) => p.cardId === picked)!;
    if (pair.back === back) {
      setMatched((m) => [...m, picked]);
      setNote('Matched.');
    } else {
      setMissed((m) => (m.includes(picked) ? m : [...m, picked]));
      setNote('Not a match. Try again.');
    }
    setPicked(null);
  }

  return (
    <section aria-label="Match the answers" className="space-y-5 rounded-xl border border-line bg-surface p-5 [overflow-wrap:anywhere]">
      <h2 className="text-[1.44rem] leading-snug font-bold text-balance">Match each question to its answer</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div role="group" aria-label="Questions" className="grid content-start gap-2">
          {item.pairs.map((p) => {
            const isMatched = matched.includes(p.cardId);
            return (
              <button key={p.cardId} type="button" className={`btn min-h-11 justify-start text-left ${picked === p.cardId ? 'btn-primary' : ''}`}
                aria-pressed={picked === p.cardId} disabled={isMatched} onClick={() => { setPicked(p.cardId); setNote(''); }}>
                {isMatched && <span className="mr-2">✓</span>}<MathText text={p.front} />
              </button>
            );
          })}
        </div>
        <div role="group" aria-label="Answers" className="grid content-start gap-2">
          {item.backs.map((b) => {
            const isMatched = item.pairs.some((p) => p.back === b && matched.includes(p.cardId));
            return (
              <button key={b} type="button" className="btn min-h-11 justify-start text-left" disabled={isMatched} onClick={() => choose(b)}>
                {isMatched && <span className="mr-2">✓</span>}<MathText text={b} />
              </button>
            );
          })}
        </div>
      </div>
      <p role="status" className="empty:hidden">{note}</p>
      {done && <button type="button" className="btn btn-primary" onClick={() => onNext(item.pairs.length - missed.length)}>Next</button>}
    </section>
  );
}
