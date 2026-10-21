'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Rating } from 'ts-fsrs';
import type { EmbedFn } from '@/lib/embed/embed';
import { getEmbedder } from '@/lib/embed/embed';
import type { ReviewCard } from '@/lib/review/load';
import type { Confidence } from '@/review/calibration';
import { recordReview, requestGrade, runSync } from '@/review/client-sync';
import { gradeLocally, scoreToRating } from '@/review/grade';
import { applyRating, buildSession, nextReview, parseDay, type Grade } from '@/review/schedule';
import { cacheDueCards, db, enqueueReview, type ReviewPayload } from '@/review/store';
import { Summary } from './summary';

export type { ReviewCard };
type Checked = { answer: string | null; source: ReviewPayload['grade_source']; score: number | null; hit: string[]; missed: string[];
  feedback: string | null; suggested: Grade | null; needsRegrade: boolean; unavailable: boolean; ms: number };
type Done = { cardId: string; rating: Grade; confidence?: Confidence };

const RATINGS: [Grade, string][] = [[Rating.Again, 'Again'], [Rating.Hard, 'Hard'], [Rating.Good, 'Good'], [Rating.Easy, 'Easy']];
const SAVE_FAILED = "We couldn't save that review. Try again.";
const CONFIDENCE: [Confidence, string, string][] = [[1, 'Guessing', 'G'], [2, 'Unsure', 'U'], [3, 'Confident', 'C']];
const CONFIDENCE_KEYS: Record<string, Confidence> = { g: 1, u: 2, c: 3 };

function SureNote({ quote }: { quote: string }) {
  return (
    <div role="status" className="max-w-xl rounded-xl border border-line bg-surface p-4">
      <p className="font-bold">You felt sure about this one, so it&apos;s worth a second look.</p>
      {quote && <p className="mt-1 text-ink-muted">From your notes: {quote}</p>}
    </div>
  );
}

/** cards: the user's kept cards with their server state. examDates: deck id → exam day (YYYY-MM-DD) or null. */
export function ReviewSession({ cards, minutes, newIntroducedToday, examDates }:
  { cards: ReviewCard[]; minutes: number; newIntroducedToday: number; examDates: Record<string, string | null> }) {
  const [all, setAll] = useState<ReviewCard[] | null>(null);
  const [queue, setQueue] = useState<ReviewCard[]>([]);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<'answer' | 'checking' | 'rate'>('answer');
  const [text, setText] = useState('');
  const [checked, setChecked] = useState<Checked | null>(null);
  const [done, setDone] = useState<Done[]>([]);
  const [error, setError] = useState('');
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [nothingMore, setNothingMore] = useState(false);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [sureNote, setSureNote] = useState<string | null>(null); // source quote after a confidently wrong answer (B3.2)
  const [showSource, setShowSource] = useState(false);
  const shownAt = useRef(Date.now());
  const embedFn = useRef<EmbedFn | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const firstRating = useRef<HTMLButtonElement>(null);
  const suggestedBtn = useRef<HTMLButtonElement>(null);
  const introduced = useRef(0);

  const examFor = (deckId: string) => (examDates[deckId] ? parseDay(examDates[deckId]!) : null);
  const nearestExam = () => Object.values(examDates).filter((d): d is string => !!d).map(parseDay)
    .filter((d) => d.getTime() >= new Date().setHours(0, 0, 0, 0)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const build = (from: ReviewCard[], doMore: boolean) => buildSession(from, {
    now: new Date(), minutes, newIntroducedToday: newIntroducedToday + introduced.current, examDate: nearestExam(), doMore,
  }).queue as ReviewCard[];

  useEffect(() => {
    let live = true;
    (async () => {
      await cacheDueCards(cards).catch(() => {});
      // A review saved on this device but not yet synced is newer than what the server sent.
      const local = new Map((await db.states.toArray().catch(() => [])).map((s) => [s.card_id, s]));
      const merged = cards.map((c) => {
        const l = local.get(c.id);
        return l && (l.last_review ?? '') > (c.state?.last_review ?? '') ? { ...c, state: l } : c;
      });
      if (!live) return;
      setAll(merged);
      setQueue(build(merged, false));
      shownAt.current = Date.now();
    })();
    getEmbedder().then((f) => { embedFn.current = f; }).catch(() => {});
    void runSync();
    window.addEventListener('online', runSync);
    return () => { live = false; window.removeEventListener('online', runSync); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per mount
  }, []);

  const current = queue[i];
  const finished = all !== null && queue.length > 0 && i >= queue.length;

  useEffect(() => {
    if (phase === 'answer') field.current?.focus();
    else if (phase === 'rate') (suggestedBtn.current ?? firstRating.current)?.focus();
  }, [phase, i, current]);

  useEffect(() => { if (finished) void runSync(); }, [finished]);

  async function check() {
    if (!current || phase !== 'answer') return;
    const answer = text;
    const ms = Date.now() - shownAt.current;
    const local = await gradeLocally({ type: current.type, reference: current.back, keyPoints: current.keyPoints, answer, responseMs: ms }, embedFn.current);
    if (!local.needsLlm) {
      setChecked({ answer, source: local.source, score: local.score, hit: local.hit, missed: local.missed, feedback: null,
        suggested: local.suggested, needsRegrade: false, unavailable: false, ms });
      setPhase('rate');
      return;
    }
    setPhase('checking');
    const r = await requestGrade(current.id, answer);
    setChecked(r
      ? { answer, source: 'llm', score: r.score, hit: r.hit, missed: r.missed, feedback: r.feedback, suggested: scoreToRating(r.score, ms),
        needsRegrade: false, unavailable: false, ms }
      : { answer, source: 'self', score: local.score, hit: [], missed: [], feedback: null, suggested: null, needsRegrade: true, unavailable: true, ms });
    setPhase('rate');
  }

  function flip() {
    setChecked({ answer: null, source: 'self', score: null, hit: [], missed: [], feedback: null, suggested: null,
      needsRegrade: false, unavailable: false, ms: Date.now() - shownAt.current });
    setPhase('rate');
  }

  async function rate(g: Grade) {
    if (!current || !checked || phase !== 'rate') return;
    const now = new Date();
    const exam = examFor(current.deckId);
    const { state } = applyRating(current, g, now, exam);
    const review: ReviewPayload = {
      client_review_id: crypto.randomUUID(), card_id: current.id, answer_text: checked.answer, grade_source: checked.source,
      ai_score: checked.score, suggested_rating: checked.suggested, final_rating: g, response_ms: checked.ms, reviewed_at: now.toISOString(),
      ...(confidence ? { confidence } : {}),
    };
    try {
      await enqueueReview(review, current.state, state, checked.needsRegrade, exam);
    } catch {
      try { await recordReview(review, state); } catch { setError(SAVE_FAILED); return; } // no IndexedDB: save directly
    }
    if (!current.state) introduced.current++;
    setError('');
    setAll((a) => a!.map((c) => (c.id === current.id ? { ...c, state } : c)));
    setDone((d) => [...d, { cardId: current.id, rating: g, ...(confidence ? { confidence } : {}) }]);
    // A confident miss is the most memorable kind once corrected, so show where the answer came from.
    setSureNote(confidence === 3 && g === Rating.Again ? current.sourceQuote ?? '' : null);
    setConfidence(null);
    setShowSource(false);
    setText('');
    setChecked(null);
    setPhase('answer');
    setI((n) => n + 1);
    shownAt.current = Date.now();
  }

  // Layout effect: a passive effect re-attaches this listener after paint, so a key pressed the instant the rating buttons appear
  // would reach the previous render's handler, which still sees the answer phase, and be ignored.
  useLayoutEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      if ((e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable]')) return;
      if (phase === 'answer') {
        const level = CONFIDENCE_KEYS[e.key.toLowerCase()];
        if (level && !text) { e.preventDefault(); setConfidence(level); }
        return;
      }
      if (phase !== 'rate') return;
      const r = RATINGS[Number(e.key) - 1];
      if (!r) return;
      e.preventDefault();
      void rate(r[0]);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function doMore() {
    const q = build(all!, true);
    if (!q.length) { setNothingMore(true); return; }
    setQueue(q);
    setI(0);
    setDone([]);
    setStartedAt(Date.now());
    shownAt.current = Date.now();
  }

  if (all === null) return <p className="text-ink-muted">Loading your cards…</p>;

  if (!queue.length) {
    const next = nextReview(all, new Date());
    return (
      <section className="max-w-prose rounded-xl border border-line bg-surface p-6">
        <h2 className="text-xl font-bold text-balance">Nothing to review right now.</h2>
        {next && <p className="mt-2 text-ink-muted">Next review: {next.label}, about {next.count} {next.count === 1 ? 'card' : 'cards'}.</p>}
        <Link href="/study" className="btn mt-6">Back to Study</Link>
      </section>
    );
  }

  if (finished) {
    return (
      <>
        {sureNote !== null && <SureNote quote={sureNote} />}
        <Summary ratings={done.map((d) => d.rating)} confidences={done.flatMap((d) => (d.confidence ? [{ confidence: d.confidence, final_rating: d.rating }] : []))}
          ms={Date.now() - startedAt} cards={all} onDoMore={doMore} nothingMore={nothingMore} />
      </>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <p className="mb-2 text-sm font-bold text-ink-muted">Card {i + 1} of {queue.length}</p>
        <div aria-hidden="true" className="h-2 overflow-hidden rounded-full border border-line bg-surface">
          <div className="h-full bg-ink" style={{ width: `${(i / queue.length) * 100}%` }} />
        </div>
      </div>

      {sureNote !== null && <SureNote quote={sureNote} />}

      <section aria-label="Current card" className="space-y-5 rounded-xl border border-line bg-surface p-5 [overflow-wrap:anywhere]">
        <h2 className="text-[1.44rem] leading-snug font-bold text-balance">{current.front}</h2>

        {phase !== 'rate' ? (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void check(); }}>
            <fieldset disabled={phase === 'checking'}>
              <legend className="mb-1 font-bold">How sure are you? <span className="font-normal text-ink-muted">(optional)</span></legend>
              <div className="flex flex-wrap gap-2">
                {CONFIDENCE.map(([level, label, key]) => (
                  <label key={level} className={`btn min-h-11 gap-2 ${confidence === level ? 'btn-primary' : ''}`}>
                    <input type="radio" name="confidence" className="sr-only" checked={confidence === level}
                      onChange={() => setConfidence(level)} aria-keyshortcuts={key} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="answer" className="mb-1 block font-bold">Your answer</label>
              <textarea ref={field} id="answer" rows={3} maxLength={2000} value={text} className="field" disabled={phase === 'checking'}
                aria-describedby="answer-hint" onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void check(); } }} />
              <p id="answer-hint" className="mt-1 text-sm text-ink-muted">Enter to check. Shift+Enter for a new line.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="submit" className="btn btn-primary" disabled={phase === 'checking'}>Check</button>
              <button type="button" className="btn" disabled={phase === 'checking'} onClick={flip}>Show answer</button>
            </div>
          </form>
        ) : checked && (
          <div className="grid gap-4 md:grid-cols-2">
            {checked.answer !== null && (
              <div>
                <h3 className="text-sm font-bold text-ink-muted">Your answer</h3>
                <p className="mt-1 whitespace-pre-wrap">{checked.answer || '(blank)'}</p>
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold text-ink-muted">Answer</h3>
              <p className="mt-1">{current.back}</p>
            </div>
            {current.sourceQuote && (
              <div className="md:col-span-2">
                <button type="button" className="text-sm underline" aria-expanded={showSource} onClick={() => setShowSource((v) => !v)}>View source</button>
                {showSource && <blockquote className="mt-2 border-l-2 border-line pl-3 text-ink-muted">{current.sourceQuote}</blockquote>}
              </div>
            )}
            {(checked.hit.length > 0 || checked.missed.length > 0) && (
              <ul className="space-y-1 md:col-span-2">
                {checked.hit.map((k) => <li key={`h-${k}`}>✓ Got this: {k}</li>)}
                {checked.missed.map((k) => <li key={`m-${k}`}>Missing: {k}</li>)}
              </ul>
            )}
          </div>
        )}

        <div role="status" className="empty:hidden">
          {phase === 'checking' && <p className="text-ink-muted">Checking your answer…</p>}
          {phase === 'rate' && checked?.unavailable && <p className="font-bold">Couldn&apos;t check this one right now. How did you do?</p>}
          {phase === 'rate' && checked?.feedback && <p className="max-w-prose">{checked.feedback}</p>}
        </div>
      </section>

      {error && <p role="alert" className="error">{error}</p>}

      {phase === 'rate' && (
        <div className="space-y-3">
          <div role="group" aria-label="How well did you know it?" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {RATINGS.map(([g, label], k) => {
              const suggested = checked?.suggested === g;
              return (
                <button key={g} ref={suggested ? suggestedBtn : k === 0 ? firstRating : undefined} type="button"
                  className={`btn flex-col ${suggested ? 'btn-primary' : ''}`} aria-pressed={suggested} aria-keyshortcuts={String(k + 1)}
                  onClick={() => void rate(g)}>
                  {label}
                  {suggested && <span className="text-sm font-normal">Suggested</span>}
                </button>
              );
            })}
          </div>
          <p className="text-sm text-ink-muted">Keys: 1 Again, 2 Hard, 3 Good, 4 Easy.</p>
        </div>
      )}
    </div>
  );
}
