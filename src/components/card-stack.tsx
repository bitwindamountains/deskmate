/** Three ruled index cards on the desk beside the page, dealt into a loose fan as a page opens, then still.
 * They are the student's flashcards: the one object on the ground (DESIGN.md). Decoration only. */
function CardStack({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 340 260" className={`deal ${className}`} fill="var(--surface)" stroke="currentColor" strokeWidth="2">
      {[{ r: -9, x: 34, y: 54 }, { r: -2, x: 50, y: 40 }, { r: 6, x: 66, y: 30 }].map(({ r, x, y }) => (
        // The outer group carries the deal animation; the inner one keeps each card's own tilt.
        <g key={r}>
          <g transform={`rotate(${r} ${x + 120} ${y + 90})`}>
            <rect x={x} y={y} width="240" height="160" rx="5" />
            <path d={`M${x + 18} ${y + 34}h204`} strokeWidth="2.5" />
            {[62, 88, 114, 140].map((dy) => <path key={dy} d={`M${x + 18} ${y + dy}h204`} strokeWidth="1" strokeOpacity="0.55" />)}
          </g>
        </g>
      ))}
    </svg>
  );
}

/** Inside the app: on the desk to the right of the page, on screens wide enough to have a margin. */
export function CardStackGround() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden text-ink lg:block">
      <CardStack className="absolute -right-24 -bottom-16 w-[22rem] opacity-[0.22]" />
    </div>
  );
}
