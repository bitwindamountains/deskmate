'use client';

import Link from 'next/link';
import { useState } from 'react';
import { EmptyStudy } from '@/components/empty-study';
import type { Deck } from '@/lib/review/load';
import type { ConceptMastery, CurvePoint, Strength } from '@/review/mastery';
import type { Remedy } from '@/review/prereqs';

export type MasterySection = { deck: Deck; concepts: ConceptMastery[]; curve: CurvePoint[]; remedies?: Remedy[] };

const IDLE = 'If you stop now';
const REVIEW = "If you review today's cards";
const STRENGTH: Record<Strength, { text: string; bar: string }> = {
  strong: { text: 'Strong', bar: 'bg-strength-strong' },
  shaky: { text: 'Shaky', bar: 'bg-strength-shaky' },
  weak: { text: 'Weak', bar: 'bg-strength-weak' },
  'not started': { text: 'Not started', bar: 'border border-dashed border-line' },
};
const pct = (v: number) => `${Math.round(v * 100)}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const reviewHref = (deckId: string, key: string) => `/study/review?deck=${encodeURIComponent(deckId)}&concept=${encodeURIComponent(key)}`;
const list = (xs: string[]) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const dayLabel = (d: number) => (d === 0 ? 'Today' : d % 7 === 0 ? `${d / 7} wk` : `Day ${d}`);

export function MasteryView({ sections }: { sections: MasterySection[] }) {
  if (!sections.length) return <EmptyStudy />;
  return (
    <div className="space-y-10">
      {sections.map(({ deck, concepts, curve, remedies = [] }) => (
        <section key={deck.id} aria-labelledby={`deck-${deck.id}`} className="space-y-4 [overflow-wrap:anywhere]">
          <h2 id={`deck-${deck.id}`} className="text-[1.44rem] font-bold text-balance">{deck.title}</h2>
          {remedies.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xl font-bold">Start with the basics</h3>
              <ul className="space-y-3">
                {remedies.map((r) => (
                  <li key={r.concept}>
                    <p>{r.concept} has been tricky. It builds on {list(r.prereqs.map((p) => `${p.label} (${STRENGTH[p.strength].text.toLowerCase()})`))}.</p>
                    <p className="flex flex-wrap gap-3">
                      {r.prereqs.map((p) => <Link key={p.key} href={reviewHref(r.deckId, p.key)} className="underline">Review {p.label}</Link>)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul className="track-in grid grid-cols-1 gap-3 sm:grid-cols-2">
            {concepts.map((c) => (
              <li key={c.key}>
                <Link href={reviewHref(c.deckId, c.key)}
                  className="flex min-h-11 flex-col gap-1 inlay p-4 transition-colors hover:border-ink">
                  <span className="font-bold">{c.label}</span>
                  <span className="text-ink-muted">{plural(c.cards, 'card')}</span>
                  <span className="flex items-center gap-2">
                    <span aria-hidden className={`h-3 w-6 ${c.strength === 'not started' ? 'rounded-sm' : 'hl'} ${STRENGTH[c.strength].bar}`} />
                    {STRENGTH[c.strength].text}
                  </span>
                </Link>
                {/* B3.7 Feynman mode: a separate link, since links can't nest. */}
                <Link href={`/study/feynman?deck=${encodeURIComponent(c.deckId)}&concept=${encodeURIComponent(c.key)}`}
                  className="mt-1 inline-flex min-h-11 items-center text-sm underline">Explain it in your own words</Link>
              </li>
            ))}
          </ul>
          <h3 className="text-xl font-bold">How your memory holds up</h3>
          {curve.length ? <Curve deckId={deck.id} curve={curve} />
            : <p className="text-ink-muted">Review a few cards to see how your memory holds up.</p>}
        </section>
      ))}
    </div>
  );
}

// viewBox units; the SVG scales with the column, capped so text stays near body size
const W = 400, H = 200, L = 46, R = 52, T = 14, B = 30; // room for labels at their larger phone size (globals.css .chart-label)

function Curve({ deckId, curve }: { deckId: string; curve: CurvePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [announce, setAnnounce] = useState(false); // the readout is spoken only for keyboard use
  const days = curve.length - 1;
  const x = (d: number) => L + (d / days) * (W - L - R);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  const path = (k: 'ifIdle' | 'ifReviewedToday') => curve.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p[k]).toFixed(1)}`).join('');
  const at14 = curve[Math.min(14, days)];
  const last = curve[days];
  // end labels only where the two line ends are far enough apart not to collide; the legend always names both
  const endLabels = Math.abs(y(last.ifIdle) - y(last.ifReviewedToday)) >= 14;
  const summaryId = `curve-summary-${deckId}`;
  const h = hover === null ? null : curve[hover];

  const fromPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    setAnnounce(false); // touch exploration would otherwise announce every day it crosses
    const box = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - box.left) / box.width) * W;
    setHover(Math.max(0, Math.min(days, Math.round(((vx - L) / (W - L - R)) * days))));
  };
  const onKey = (e: React.KeyboardEvent) => {
    setAnnounce(true);
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (e.key === 'Home') setHover(0);
    else if (e.key === 'End') setHover(days);
    else if (step) setHover((d) => Math.max(0, Math.min(days, (d ?? 0) + step)));
    else return;
    e.preventDefault();
  };

  return (
    <figure className="max-w-lg space-y-3">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[0.875rem]">
        <li className="flex items-center gap-2"><span aria-hidden className="h-0.5 w-5 rounded bg-chart-review" />{REVIEW}</li>
        <li className="flex items-center gap-2"><span aria-hidden className="h-0.5 w-5 rounded bg-chart-idle" />{IDLE}</li>
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-pan-y" role="img" aria-label="Forgetting curve, next 30 days"
        aria-describedby={summaryId} tabIndex={0} onPointerMove={fromPointer} onPointerLeave={() => setHover(null)}
        onFocus={() => { setAnnounce(true); setHover((d) => d ?? 0); }} onBlur={() => setHover(null)} onKeyDown={onKey}>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeOpacity={v ? 0.3 : 0.8} strokeWidth={1} />
            <text x={L - 6} y={y(v)} dy="0.35em" textAnchor="end" fontSize={11} fill="var(--ink-muted)" className="chart-label tabular-nums">{pct(v)}</text>
          </g>
        ))}
        {[0, 7, 14, 21, 28].filter((d) => d <= days).map((d) => (
          <text key={d} x={x(d)} y={H - 8} textAnchor="middle" fontSize={11} className="chart-label" fill="var(--ink-muted)">{dayLabel(d)}</text>
        ))}
        <path d={path('ifIdle')} fill="none" stroke="var(--chart-idle)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={path('ifReviewedToday')} fill="none" stroke="var(--chart-review)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {(['ifIdle', 'ifReviewedToday'] as const).map((k) => (
          <g key={k}>
            <circle cx={x(days)} cy={y(last[k])} r={4} fill={`var(--chart-${k === 'ifIdle' ? 'idle' : 'review'})`} stroke="var(--surface)" strokeWidth={2} />
            {endLabels && <text x={x(days) + 8} y={y(last[k])} dy="0.35em" fontSize={11} fill="var(--ink)" className="chart-label tabular-nums">{pct(last[k])}</text>}
          </g>
        ))}
        {h && (
          <g pointerEvents="none">
            <line x1={x(h.day)} x2={x(h.day)} y1={T} y2={H - B} stroke="var(--ink-muted)" strokeWidth={1} />
            <g transform={`translate(${Math.min(x(h.day) + 6, W - R - 112)},${T})`}>
              <rect width={112} height={52} rx={6} fill="var(--surface)" stroke="var(--line)" />
              <text x={8} y={16} fontSize={11} fill="var(--ink-muted)">{dayLabel(h.day)}</text>
              <line x1={8} x2={18} y1={29} y2={29} stroke="var(--chart-review)" strokeWidth={2} />
              <text x={24} y={29} dy="0.35em" fontSize={11} fontWeight={700} fill="var(--ink)">{pct(h.ifReviewedToday)} reviewed</text>
              <line x1={8} x2={18} y1={43} y2={43} stroke="var(--chart-idle)" strokeWidth={2} />
              <text x={24} y={43} dy="0.35em" fontSize={11} fontWeight={700} fill="var(--ink)">{pct(h.ifIdle)} stopped</text>
            </g>
          </g>
        )}
      </svg>
      {/* The SVG is one image to assistive tech, so the hovered or arrowed day is read out here. */}
      <p role="status" className="sr-only">{h && announce ? `${dayLabel(h.day)}: ${pct(h.ifReviewedToday)} reviewed, ${pct(h.ifIdle)} stopped` : ''}</p>
      <figcaption id={summaryId}>
        In 2 weeks you&apos;d remember about {pct(at14.ifIdle)}; reviewing today keeps it near {pct(at14.ifReviewedToday)}.
      </figcaption>
      <details>
        <summary className="inline-flex min-h-11 cursor-pointer items-center underline">Show the data table</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead><tr><th scope="col">Day</th><th scope="col">{IDLE}</th><th scope="col">{REVIEW}</th></tr></thead>
          <tbody>
            {curve.map((p) => <tr key={p.day}><th scope="row" className="font-normal">{dayLabel(p.day)}</th><td>{pct(p.ifIdle)}</td><td>{pct(p.ifReviewedToday)}</td></tr>)}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
