'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { ItemRow, Layer } from '@/lib/essay/analyze';
import type { SelfAssessment } from '@/lib/essay/self-check';
import { rankFeedback } from '@/rank';
import { Alignment, type AlignmentPart } from './alignment';
import { FeedbackCard, isOpen, LAYER_BG, LAYER_LABEL, REWRITE_CAP, type CardApi } from './feedback-card';
import { Editor, storedDraft } from './editor';
import { FocusMode } from './focus';
import { Outline, type OutlineLine } from './outline';
import { ReadAloud, type Reading } from './read-aloud';
import { SelfCheck } from './self-check';
import { carryOverCounts, logViewedLevel, markGotIt, type CarryOver } from './item-actions';
import type { DialogueKind, ThreadMessage } from './item-dialogue';

export type Score = { criterion: string; score: number; justification: string; confidence: 'high' | 'medium' | 'low' };
export type Strength = { paragraph_index: number; quote: string; why: string; start: number; end: number };
export type Analysis = { rubric_scores: Score[]; strengths: Strength[]; safety_concern: boolean; prompt_alignment?: AlignmentPart[] | null };
type LayerState = { state: 'waiting' | 'running' | 'done' | 'failed'; message?: string };
type Span = { id: string; para: number; start: number; end: number; layer: keyof typeof LAYER_LABEL };

const LAYERS: Layer[] = ['global', 'paragraphs', 'sentences'];
const PROGRESS: Record<Layer, string> = { global: 'Reading the big picture…', paragraphs: 'Checking paragraphs…', sentences: 'Checking sentences…' };
const LAYER_NAME: Record<Layer, string> = { global: 'Big picture feedback', paragraphs: 'Paragraph feedback', sentences: 'Sentence feedback' };
const GROUPS = ['global', 'paragraph', 'sentence'] as const;
const OFFLINE = "Couldn't reach Draft Coach. Check your connection and try again.";
const HINT_FAILED = "Couldn't make a suggestion for this one.";
const CAP_REACHED = "You've used this draft's 3 suggested rewrites.";
const SAVE_FAILED = "We couldn't save that. Try again.";
const RETRY_MS = 3000, MAX_WAITS = 20; // 409: another tab is running this layer

// Every criterion weighs 1, so a null rubric_criterion ranks the same as any other.
const rank = (xs: ItemRow[]) => rankFeedback(xs as (ItemRow & { rubric_criterion: string })[]);
const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export function EssayView({ essayId, draftId, version, content, paragraphs, layers, items: initialItems, analysis: initialAnalysis, rewritesUsed, showScores, rubricMax, outline: initialOutline = null, threads: initialThreads = {}, selfAssessment = null, timed = null, topCount = 3 }: {
  essayId: string; draftId: string; version: number; content: string; paragraphs: string[]; layers: Record<string, string>; items: ItemRow[]; analysis: Analysis | null;
  rewritesUsed: number; showScores: boolean; rubricMax: Record<string, number>; outline?: OutlineLine[] | null;
  threads?: Record<string, ThreadMessage[]>; selfAssessment?: SelfAssessment | null;
  /** Spec J5: 5 once the student has addressed three priorities in a row, otherwise 3. */
  topCount?: 3 | 5;
  /** A4.5: the time limit, and the minutes used (first draft only). */
  timed?: { limit: number; used: number | null } | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [outline, setOutline] = useState(initialOutline);
  const [threads, setThreads] = useState(initialThreads);
  const [reading, setReading] = useState<Reading | null>(null);
  const [layerState, setLayerState] = useState(() =>
    Object.fromEntries(LAYERS.map((l) => [l, { state: layers[l] === 'done' ? 'done' : 'waiting' }])) as Record<Layer, LayerState>);
  const [statusOf, setStatusOf] = useState<Record<string, string>>({});
  const [shownOf, setShownOf] = useState<Record<string, number>>({});
  const [noteOf, setNoteOf] = useState<Record<string, string | undefined>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [used, setUsed] = useState(rewritesUsed);
  const [showAll, setShowAll] = useState(false);
  const [sentencesOpen, setSentencesOpen] = useState(false);
  const [focus, setFocus] = useState<{ ids: string[]; id: string | null } | null>(null);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [carry, setCarry] = useState<CarryOver | null>(null);

  const setLayer = (l: Layer, s: LayerState) => setLayerState((x) => ({ ...x, [l]: s }));

  /** Runs one layer; returns a message that should stop the layers after it (quota, sign-in), else null. */
  async function runLayer(l: Layer): Promise<string | null> {
    setLayer(l, { state: 'running' });
    for (let waits = 0; ; waits++) {
      let res: Response;
      try { res = await post('/api/essays/analyze', { draftId, layer: l }); } catch { setLayer(l, { state: 'failed', message: OFFLINE }); return null; }
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems(body.items);
        if (body.analysis) setAnalysis(body.analysis);
        if (body.outline) setOutline(body.outline);
        setLayer(l, { state: 'done' });
        // The global layer is what judges the previous draft's items, so their statuses are final now.
        if (l === 'global' && version > 1) carryOverCounts(essayId, version - 1).then(setCarry, () => {});
        return null;
      }
      if (res.status === 409 && waits < MAX_WAITS) { await new Promise((r) => setTimeout(r, RETRY_MS)); continue; }
      const message = body.message ?? OFFLINE;
      setLayer(l, { state: 'failed', message });
      return [401, 403, 429].includes(res.status) ? message : null;
    }
  }

  useEffect(() => {
    (async () => {
      let stop: string | null = null;
      for (const l of LAYERS) {
        if (layers[l] === 'done') continue;
        if (stop) setLayer(l, { state: 'failed', message: stop });
        else stop = await runLayer(l);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per mount
  }, []);

  useEffect(() => {
    if (storedDraft(essayId) !== null) setEditing(true); // unsent edits from an earlier visit
  }, [essayId]);

  useEffect(() => {
    if (!focusTarget) return;
    document.getElementById(focusTarget)?.focus();
    setFocusTarget(null);
  }, [focusTarget]);

  const status = (it: ItemRow) => statusOf[it.id] ?? it.status;
  // Top 3 ranks the server statuses, so a Got it in this session doesn't reshuffle the list under the student.
  const top3 = useMemo(() => rank(items.filter((i) => isOpen(i.status))).slice(0, topCount), [items, topCount]);
  const topIds = new Set(top3.map((i) => i.id));
  const rest = items.filter((i) => !topIds.has(i.id));
  const globalOpen = items.some((i) => i.layer === 'global' && isOpen(status(i)));
  const focusItem = focus?.id ? items.find((i) => i.id === focus.id) : undefined;

  // Overlapping anchors: only the highest-ranked item gets a highlight; the others point at the one that covers them.
  const { spans, markOf } = useMemo(() => {
    const ranked = focus ? (focusItem ? [focusItem] : []) : rank(items);
    const cands: Span[] = ranked.flatMap((i) => (i.paragraph_index !== null && i.anchor_start !== null && i.anchor_end !== null
      ? [{ id: i.id, para: i.paragraph_index, start: i.anchor_start, end: i.anchor_end, layer: i.layer }] : []));
    if (!focus) (analysis?.strengths ?? []).forEach((s, k) => cands.push({ id: `strength-${k}`, para: s.paragraph_index, start: s.start, end: s.end, layer: 'strength' }));
    const spans: Span[] = [];
    const markOf: Record<string, string> = {};
    for (const c of cands) {
      if (c.end > (paragraphs[c.para]?.length ?? -1)) continue;
      const hit = spans.find((s) => s.para === c.para && s.start < c.end && c.start < s.end);
      if (!hit) spans.push(c);
      markOf[c.id] = `hl-${(hit ?? c).id}`;
    }
    return { spans, markOf };
  }, [items, analysis, focus, focusItem, paragraphs]);

  function openCard(id: string) {
    const it = items.find((i) => i.id === id);
    if (it && !topIds.has(id)) setShowAll(true);
    if (it?.layer === 'sentence') setSentencesOpen(true);
    setFocusTarget(`card-${id}`);
  }

  async function nextHint(it: ItemRow) {
    let level = (shownOf[it.id] ?? it.highest_level) + 1;
    if (level <= 2 && !it.hints[level - 1]) level = 3; // levels 1-2 come only from the analysis; the route makes 3-5
    const stored = level <= 4 ? it.hints[level - 1] : it.rewrite;
    const reveal = () => setShownOf((x) => ({ ...x, [it.id]: level }));
    setNoteOf((x) => ({ ...x, [it.id]: undefined }));
    if (stored) {
      reveal();
      if (level <= 2) logViewedLevel(it.id, level as 1 | 2).catch(() => {}); // a lost view event doesn't block the hint
      return;
    }
    if (level === 5 && used >= REWRITE_CAP) { setNoteOf((x) => ({ ...x, [it.id]: CAP_REACHED })); return; }
    setBusyId(it.id);
    let note = HINT_FAILED;
    try {
      const res = await post('/api/essays/hint', { itemId: it.id, level });
      const body = await res.json().catch(() => ({}));
      if (res.ok && typeof body.text === 'string') {
        const text: string = body.text;
        setItems((xs) => xs.map((x) => (x.id !== it.id ? x : level === 5 ? { ...x, rewrite: text }
          : { ...x, hints: Array.from({ length: Math.max(x.hints.length, level) }, (_, i) => (i === level - 1 ? text : x.hints[i] ?? '')) })));
        if (level === 5) setUsed((u) => u + 1);
        reveal();
        note = '';
      } else {
        if (res.status === 429) setUsed(REWRITE_CAP);
        note = body.message ?? HINT_FAILED;
      }
    } catch {
      note = OFFLINE;
    }
    setBusyId(null);
    if (note) setNoteOf((x) => ({ ...x, [it.id]: note }));
  }

  const save = async (it: ItemRow, next: string, write: () => Promise<void>) => {
    try {
      await write();
      setStatusOf((x) => ({ ...x, [it.id]: next }));
      return true;
    } catch {
      setNoteOf((x) => ({ ...x, [it.id]: SAVE_FAILED }));
      return false;
    }
  };

  async function send(it: ItemRow, kind: DialogueKind, message: string): Promise<string | null> {
    let res: Response;
    try { res = await post('/api/essays/dialogue', { itemId: it.id, kind, message }); } catch { return OFFLINE; }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || typeof body.reply !== 'string') return body.message ?? OFFLINE;
    setThreads((t) => ({ ...t, [it.id]: [...(t[it.id] ?? []), { role: 'student', kind, text: message, verdict: null },
      { role: 'coach', kind, text: body.reply, verdict: body.verdict ?? null }] }));
    if (kind === 'dispute') {
      // A withdrawn item leaves Top 3 at once, so it updates the server statuses that Top 3 ranks.
      if (body.verdict === 'withdraw') {
        setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, status: 'withdrawn' } : x)));
        setStatusOf((x) => ({ ...x, [it.id]: 'withdrawn' })); // overrides an earlier 'disputed' from a keep
      } else {
        if (body.revisedSummary) setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, revised_summary: body.revisedSummary } : x)));
        setStatusOf((x) => ({ ...x, [it.id]: 'disputed' }));
      }
    }
    return null;
  }

  const api: CardApi = {
    status, rewritesLeft: Math.max(0, REWRITE_CAP - used),
    shown: (it) => shownOf[it.id] ?? it.highest_level,
    note: (it) => noteOf[it.id],
    busy: (it) => busyId === it.id,
    markId: (it) => markOf[it.id] ?? null,
    nextHint: (it) => void nextHint(it),
    gotIt: (it) => save(it, 'got_it', () => markGotIt(it.id)),
    thread: (it) => threads[it.id] ?? [],
    send,
    showInEssay: (it) => document.getElementById(markOf[it.id])?.focus(),
  };

  const running = LAYERS.find((l) => layerState[l].state === 'running');
  const failed = LAYERS.filter((l) => layerState[l].state === 'failed');
  const strengths = analysis?.strengths ?? [];
  const alignment = analysis?.prompt_alignment ?? [];
  // An essay that misses part of the assignment leads with that (brief A7).
  const offPrompt = alignment.some((p) => p.status === 'missing');
  const focusPara = focusItem?.paragraph_index ?? null;

  return (
    <div className="grid gap-8 md:grid-cols-[3fr_2fr]">
      <section aria-label="Your essay" className="min-w-0">
        <div className="mb-6 flex flex-wrap gap-3">
          <a href="#feedback" className="btn md:hidden">Jump to feedback</a>
          <button type="button" className="btn" aria-pressed={editing} onClick={() => { setEditing((v) => !v); setReading(null); }}>Edit</button>
          {version > 1 && <Link href={`/write/${essayId}/compare?from=${version - 1}&to=${version}`} className="btn">Compare with draft {version - 1}</Link>}
          {!editing && <ReadAloud paragraphs={paragraphs} onSentence={setReading} />}
        </div>
        {timed && <p className="mb-4 text-sm text-ink-muted">{timed.used !== null ? `Timed practice: written in ${timed.used} of ${timed.limit} minutes` : `Timed practice: ${timed.limit} minutes`}</p>}
        {editing ? <Editor essayId={essayId} content={content} /> : (
          <div className="max-w-prose space-y-4 rounded-xl border border-line bg-surface p-5 [overflow-wrap:anywhere]">
            {paragraphs.map((text, i) => {
              const dimmed = !!focus && focusPara !== null && i !== focusPara;
              return (
                <p key={i} id={`para-${i}`} tabIndex={-1} data-paragraph={i} data-dimmed={String(dimmed)} className={dimmed ? 'text-ink-muted' : undefined}>
                  {reading?.para === i ? (
                    // While read aloud, the paragraph drops its highlights so the sentence outline is the only mark in it.
                    <>
                      {text.slice(0, reading.start)}
                      <span className="rounded-sm border-2 border-ink px-0.5 box-decoration-clone"><span className="sr-only">Now reading:</span>{text.slice(reading.start, reading.end)}</span>
                      {text.slice(reading.end)}
                    </>
                  ) : <Marked text={text} spans={spans.filter((s) => s.para === i)} onMark={openCard} />}
                </p>
              );
            })}
          </div>
        )}
        {!editing && outline && outline.length > 0 && <Outline lines={outline} />}
      </section>

      <section id="feedback" tabIndex={-1} aria-label="Feedback" className="min-w-0 space-y-8 outline-none">
        {analysis?.safety_concern && (
          <section aria-labelledby="support-h" className="space-y-3 rounded-xl border border-line bg-surface p-5">
            <h2 id="support-h" className="text-xl font-bold">Support</h2>
            <p>It sounds like you&apos;re going through something hard. You don&apos;t have to handle it alone.</p>
            <ul className="space-y-1">
              <li>NCMH Crisis Hotline (Philippines), any time: <a href="tel:1553" className="font-bold underline">1553</a></li>
              <li>Anywhere else: <a href="https://findahelpline.com" className="font-bold underline">findahelpline.com</a></li>
            </ul>
          </section>
        )}

        <div role="status" className="space-y-2 empty:hidden">
          {carry && <p className="font-bold">{`${carry.addressed} addressed · ${carry.partial} partly addressed · ${carry.open} still open since draft ${version - 1}`}</p>}
          {running && <p className="text-ink-muted">{PROGRESS[running]}</p>}
        </div>
        {failed.map((l) => (
          <div key={l} role="alert" className="space-y-2 rounded-xl border border-line bg-surface p-4">
            <p className="text-sm font-bold">{LAYER_NAME[l]}</p>
            <p id={`failed-${l}`}>{layerState[l].message}</p>
            <button type="button" className="btn" aria-describedby={`failed-${l}`} onClick={() => void runLayer(l)}>Try again</button>
          </div>
        ))}

        {focus ? (
          <FocusMode items={focus.ids.flatMap((id) => items.filter((i) => i.id === id))} current={focus.id} api={api}
            onPick={(id) => setFocus((f) => f && { ...f, id })}
            onExit={() => { setFocus(null); setFocusTarget('start-focus'); }} />
        ) : (
          <>
            {offPrompt && <Alignment parts={alignment} />}
            {strengths.length > 0 && (
              <section aria-labelledby="strengths-h" className="space-y-3">
                <h2 id="strengths-h" className="text-xl font-bold">Strengths</h2>
                <ul className="space-y-3">
                  {strengths.map((s, k) => (
                    <li key={k} id={`card-strength-${k}`} tabIndex={-1} className="space-y-2 rounded-xl border border-line bg-surface p-4 [overflow-wrap:anywhere]">
                      <p className="text-sm font-bold"><span className={`rounded-md px-2 py-0.5 ${LAYER_BG.strength}`}>{LAYER_LABEL.strength}</span></p>
                      <blockquote className="border-l-2 border-line pl-3 text-ink-muted">“{s.quote}”</blockquote>
                      <p>{s.why}</p>
                      {markOf[`strength-${k}`] && (
                        <button type="button" className="btn" onClick={() => document.getElementById(markOf[`strength-${k}`])?.focus()}>Show in essay</button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(top3.length > 0 || layerState.global.state === 'done') && (
              <section aria-labelledby="top-h" className="space-y-3">
                <h2 id="top-h" className="text-xl font-bold">Top {topCount} priorities</h2>
                {top3.length > 0 ? (
                  <button id="start-focus" type="button" className="btn btn-primary"
                    onClick={() => setFocus({ ids: top3.map((i) => i.id), id: (top3.find((i) => isOpen(status(i))) ?? top3[0]).id })}>
                    Start focus mode
                  </button>
                ) : <p className="text-ink-muted">Nothing open right now. Revise and check again when you&apos;re ready.</p>}
                {top3.map((it) => <FeedbackCard key={it.id} item={it} api={api} />)}
              </section>
            )}

            {!offPrompt && alignment.length > 0 && <Alignment parts={alignment} />}

            {selfAssessment && analysis && (
              <SelfCheck self={selfAssessment} ai={analysis.rubric_scores} topSummary={top3[0] ? top3[0].revised_summary ?? top3[0].summary : null} showScores={showScores} />
            )}

            {rest.length > 0 && (
              <div className="space-y-4">
                <button type="button" className="btn" aria-expanded={showAll} aria-controls="all-feedback" onClick={() => setShowAll((v) => !v)}>Show all</button>
                {showAll && (
                  <section id="all-feedback" aria-label="All feedback" className="space-y-6">
                    {GROUPS.map((g) => {
                      const group = rest.filter((i) => i.layer === g);
                      if (!group.length) return null;
                      const collapsed = g === 'sentence' && globalOpen && !sentencesOpen;
                      return (
                        <div key={g} className="space-y-3">
                          <h3 className="font-bold">{LAYER_LABEL[g]}</h3>
                          {collapsed ? (
                            <>
                              <p className="text-ink-muted">Sentence notes wait while a big-picture item is open, since revising may change these sentences.</p>
                              <button type="button" className="btn" aria-expanded="false" onClick={() => setSentencesOpen(true)}>
                                Show {group.length} sentence {group.length === 1 ? 'note' : 'notes'}
                              </button>
                            </>
                          ) : group.map((it) => <FeedbackCard key={it.id} item={it} api={api} heading="h4" />)}
                        </div>
                      );
                    })}
                  </section>
                )}
              </div>
            )}

            {showScores && analysis && analysis.rubric_scores.length > 0 && (
              <section aria-labelledby="scores-h" className="space-y-3">
                <h2 id="scores-h" className="text-xl font-bold">Rubric scores</h2>
                <ul className="divide-y divide-line/40 rounded-xl border border-line bg-surface px-4">
                  {analysis.rubric_scores.map((s) => (
                    <li key={s.criterion} className="space-y-1 py-3">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">{`${s.criterion}: ${s.score}${rubricMax[s.criterion] ? ` of ${rubricMax[s.criterion]}` : ''}`}</span>
                        {s.confidence === 'low' && <span className="rounded-md border border-line px-2 text-sm font-bold">Estimate</span>}
                      </p>
                      <p>{s.justification}</p>
                      {s.confidence !== 'low' && <p className="text-sm text-ink-muted">Confidence: {s.confidence}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/** A paragraph with its highlights. Each mark carries its layer label as text, so colour is never the only signal. */
function Marked({ text, spans, onMark }: { text: string; spans: Span[]; onMark: (id: string) => void }) {
  const out: React.ReactNode[] = [];
  let pos = 0;
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    out.push(text.slice(pos, s.start));
    out.push(
      // Not a tab stop: dozens of marks would bury the panel. Keyboard users reach each card directly and come back with Show in essay.
      <mark key={s.id} id={`hl-${s.id}`} tabIndex={-1} onClick={() => onMark(s.id)}
        className={`cursor-pointer rounded-sm px-0.5 text-ink shadow-[inset_0_-2px_var(--line)] [box-decoration-break:clone] ${LAYER_BG[s.layer]}`}>
        {/* the hidden ": " keeps screen readers from running the label into the quote ("Big pictureAttendance…") */}
        <span className="mr-1 text-sm font-bold">{LAYER_LABEL[s.layer]}<span className="sr-only">: </span></span>
        {text.slice(s.start, s.end)}
      </mark>,
    );
    pos = s.end;
  }
  out.push(text.slice(pos));
  return <>{out}</>;
}
