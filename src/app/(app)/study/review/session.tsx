'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Rating } from 'ts-fsrs';
import { ReportProblem } from '@/components/report-problem';
import type { EmbedFn } from '@/lib/embed/embed';
import { getEmbedder } from '@/lib/embed/embed';
import { promptForWhy, writeHref } from '@/growth/prompts';
import type { ReviewCard } from '@/lib/review/load';
import type { Confidence } from '@/review/calibration';
import { recordReview, requestGrade, runSync } from '@/review/client-sync';
import { gradeLocally, scoreToRating } from '@/review/grade';
import { applyRating, buildSession, nextReview, parseDay, type Grade } from '@/review/schedule';
import { cacheDueCards, db, enqueueReview, type ReviewPayload } from '@/review/store';
import { CardHelpPanel } from './card-help';
import { conceptSummary, interleave } from '@/review/interleave';
import { Summary } from './summary';

export type { ReviewCard };
type Checked = { answer: string | null; source: ReviewPayload['grade_source']; score: number | null; hit: string[]; missed: string[];
  feedback: string | null; suggested: Grade | null; needsRegrade: boolean; unavailable: boolean; ms: number };
type Done = { cardId: string; concept: string; rating: Grade; confidence?: Confidence };

const RATINGS: [Grade, string][] = [[Rating.Again, 'Again'], [Rating.Hard, 'Hard'], [Rating.Good, 'Good'], [Rating.Easy, 'Easy']];
const SAVE_FAILED = "We couldn't save that review. Try again.";
const LEECH_LAPSES = 4; // brief B3.3
const MIX_KEY = 'scholar-mix-topics';
const readMix = () => { try { return localStorage.getItem(MIX_KEY) === '1'; } catch { return false; } };
const CONFIDENCE: [Confidence, string, string][] = [[1, 'Guessing', 'G'], [2, 'Unsure', 'U'], [3, 'Confident', 'C']];
const CONFIDENCE_KEYS: Record<string, Confidence> = { g: 1, u: 2, c: 3 };

type Slip = { cardId: string; deckId: string; front: string; open: boolean };

/** Shown above the next card after a missed "why" card: explaining it in a paragraph is the next step (C1). */
function ExplainNote({ front }: { front: string }) {
  return (
    <p className="rounded-xl border border-line bg-surface p-4">
      {`Still unsure about “${front}”? `}
      <Link href={writeHref(front, promptForWhy(front))} className="font-bold underline">Explain it in writing</Link>
    </p>
  );
}

function Slipping({ slip, onOpen }: { slip: Slip; onOpen: () => void }) {
  return (
    <div className="max-w-xl space-y-3 rounded-xl border border-line bg-surface p-4 [overflow-wrap:anywhere]">
      <p className="font-bold">“{slip.front}” keeps slipping. Want a different way in?</p>
      {slip.open ? <CardHelpPanel cardId={slip.cardId} deckId={slip.deckId} /> : <button type="button" className="btn" onClick={onOpen}>Get help</button>}
    </div>
  );
}

function SureNote({ front, quote, example }: { front: string; quote: string; example?: boolean }) {
  return (
    <div role="status" className="max-w-xl rounded-xl border border-line bg-surface p-4 [overflow-wrap:anywhere]">
      <p className="font-bold">You felt sure about “{front}”, so it&apos;s worth a second look.</p>
      {quote && <p className="mt-1 text-ink-muted">{example ? 'Example' : 'From your notes'}: {quote}</p>}
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
  const [sureNote, setSureNote] = useState<{ front: string; quote: string; example?: boolean } | null>(null); // after a confidently wrong answer (B3.2)
  const [showSource, setShowSource] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false); // "Make a mnemonic" on the current card
  const [slipping, setSlipping] = useState<Slip | null>(null); // last card is a leech (B3.3)
  const [explain, setExplain] = useState<string | null>(null); // a missed why card can become a writing task (C1)
  const shownAt = useRef(Date.now());
  const embedFn = useRef<EmbedFn | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const firstRating = useRef<HTMLButtonElement>(null);
  const suggestedBtn = useRef<HTMLButtonElement>(null);
  const introduced = useRef(0);
  const [mix, setMix] = useState(false); // "Mix topics" (B3.9)
  const base = useRef<ReviewCard[]>([]); // the session's due order, kept so Mix topics can be switched off again

  const examFor = (deckId: string) => (examDates[deckId] ? parseDay(examDates[deckId]!) : null);
  const nearestExam = () => Object.values(examDates).filter((d): d is string => !!d).map((d) => parseDay(d))
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
      const mixed = readMix();
      base.current = build(merged, false);
      setMix(mixed);
      setQueue(mixed ? interleave(base.current) : base.current);
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
    setDone((d) => [...d, { cardId: current.id, concept: current.concept, rating: g, ...(confidence ? { confidence } : {}) }]);
    // A confident miss is the most memorable kind once corrected, so show where the answer came from.
    // Shown above the next card, so it names the card it is about.
    setSureNote(confidence === 3 && g === Rating.Again ? { front: current.front, quote: current.sourceQuote ?? '', example: current.quoteIsExample } : null);
    setSlipping(g === Rating.Again && state.lapses >= LEECH_LAPSES ? { cardId: current.id, deckId: current.deckId, front: current.front, open: false } : null);
    setExplain(current.type === 'why' && g <= Rating.Hard ? current.front : null);
    setConfidence(null);
    setShowSource(false);
    setHelpOpen(false);
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
    base.current = build(all!, true);
    const q = mix ? interleave(base.current) : base.current;
    if (!q.length) { setNothingMore(true); return; }
    setQueue(q);
    setI(0);
    setDone([]);
    setStartedAt(Date.now());
    shownAt.current = Date.now();
  }

  function toggleMix() {
    const next = !mix;
    setMix(next);
    try { localStorage.setItem(MIX_KEY, next ? '1' : '0'); } catch { /* storage blocked: the choice lasts this session only */ }
    // The card on screen stays put (an answer may already be checked against it); only the cards after it move.
    // It leads the reorder so interleaving alternates away from its concept first.
    setQueue((q) => {
      if (i >= q.length) return q;
      const rest = new Set(q.slice(i + 1).map((c) => c.id));
      const ordered = [q[i], ...base.current.filter((c) => rest.has(c.id))];
      return [...q.slice(0, i), ...(next ? interleave(ordered) : ordered)];
    });
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
        {sureNote !== null && <SureNote front={sureNote.front} quote={sureNote.quote} example={sureNote.example} />}
        {slipping && <Slipping slip={slipping} onOpen={() => setSlipping({ ...slipping, open: true })} />}
        {explain && <ExplainNote front={explain} />}
        <Summary ratings={done.map((d) => d.rating)} concepts={conceptSummary(done.map((d) => ({ concept: d.concept, rating: d.rating })))} confidences={done.flatMap((d) => (d.confidence ? [{ confidence: d.confidence, final_rating: d.rating }] : []))}
          ms={Date.now() - startedAt} cards={all} onDoMore={doMore} nothingMore={nothingMore} />
      </>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-ink-muted">Card {i + 1} of {queue.length}</p>
          <button type="button" role="switch" aria-checked={mix} onClick={toggleMix} className="inline-flex min-h-11 items-center gap-2 text-sm">
            <span aria-hidden="true" className={`inline-block h-5 w-9 rounded-full border border-line p-0.5 ${mix ? 'bg-ink' : 'bg-surface'}`}>
              <span className={`block h-3.5 w-3.5 rounded-full ${mix ? 'translate-x-4 bg-ground' : 'bg-ink-muted'} transition-transform`} />
            </span>
            Mix topics
          </button>
        </div>
        <div aria-hidden="true" className="h-2 overflow-hidden rounded-full border border-line bg-surface">
          <div className="h-full bg-ink" style={{ width: `${(i / queue.length) * 100}%` }} />
        </div>
      </div>

      {sureNote !== null && <SureNote front={sureNote.front} quote={sureNote.quote} example={sureNote.example} />}
      {slipping && <Slipping slip={slipping} onOpen={() => setSlipping({ ...slipping, open: true })} />}
      {explain && <ExplainNote front={explain} />}

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
            <div className="space-y-2 md:col-span-2">
              <div className="flex flex-wrap gap-x-4">
                {current.sourceQuote && (
                  <button type="button" className="text-sm underline" aria-expanded={showSource} onClick={() => setShowSource((v) => !v)}>View source</button>
                )}
                {!helpOpen && <button type="button" className="text-sm underline" onClick={() => setHelpOpen(true)}>Make a mnemonic</button>}
              </div>
              {showSource && <blockquote className="border-l-2 border-line pl-3 text-ink-muted">{current.sourceQuote}</blockquote>}
              {helpOpen && <CardHelpPanel cardId={current.id} deckId={current.deckId} />}
              <ReportProblem key={current.id} target="card" targetId={current.id} />
            </div>
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
