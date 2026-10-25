/** The mixtape the J-card belongs to, drawn in ballpoint. It plays once as a page opens (reels turn, tape moves from
 * the left pack to the right), then stops. Decoration only; reduced motion shows it still (DESIGN.md). */
function Cassette({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 400 256" className={`cassette-play ${className}`} fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <clipPath id="cassette-window"><rect x="110" y="88" width="180" height="52" rx="26" /></clipPath>
      </defs>
      <rect x="4" y="4" width="392" height="248" rx="14" />
      <rect x="28" y="24" width="344" height="136" rx="6" />
      <path d="M48 52h304M48 74h120M232 74h120" strokeWidth="1.5" />
      <text x="40" y="132" fill="currentColor" stroke="none" fontSize="34" fontFamily="var(--font-patrick), sans-serif">A</text>
      <g clipPath="url(#cassette-window)">
        <circle className="pack-l" cx="150" cy="114" r="34" fill="currentColor" fillOpacity="0.18" strokeWidth="1.5" />
        <circle className="pack-r" cx="250" cy="114" r="22" fill="currentColor" fillOpacity="0.18" strokeWidth="1.5" />
      </g>
      <rect x="110" y="88" width="180" height="52" rx="26" />
      {[150, 250].map((cx) => (
        <g key={cx} className="hub">
          <circle cx={cx} cy="114" r="11" />
          <path d={`M${cx} 103v5M${cx} 120v5M${cx - 9.5} 108.5l4.3 2.5M${cx + 5.2} 117l4.3 2.5M${cx - 9.5} 119.5l4.3-2.5M${cx + 5.2} 111l4.3-2.5`} strokeWidth="1.5" />
        </g>
      ))}
      <path d="M110 252l20-56h140l20 56" />
      <circle cx="160" cy="228" r="7" /><circle cx="240" cy="228" r="7" />
      {[[20, 20], [380, 20], [20, 236], [380, 236]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="4" strokeWidth="1.5" />)}
    </svg>
  );
}

/** Inside the app: lying in the right margin on wide screens, like a tape on the desk beside the page. */
export function CassetteGround() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden text-ink lg:block">
      <Cassette className="absolute -right-16 bottom-8 w-[26rem] -rotate-[8deg] opacity-[0.13]" />
    </div>
  );
}

/** Sign-in and onboarding: the tape sits large behind the form. */
export function CassetteHero() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden text-ink">
      <Cassette className="absolute -right-20 -bottom-10 w-[24rem] -rotate-[8deg] opacity-[0.14] md:right-[6%] md:bottom-[8%] md:w-[36rem]" />
    </div>
  );
}
