/** Two faint cassette reels on the page ground that wind as the page scrolls (decoration only; DESIGN.md). */
function GroundReel({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 200 200" className={`ground-reel absolute ${className}`} fill="none" stroke="currentColor">
      <circle cx="100" cy="100" r="96" strokeWidth="2" />
      <circle cx="100" cy="100" r="70" strokeWidth="14" strokeOpacity="0.5" />
      <circle cx="100" cy="100" r="24" strokeWidth="2" />
      <path strokeWidth="2" d="M100 24v52M100 124v52M34.2 62l45 26M120.8 112l45 26M34.2 138l45-26M120.8 88l45-26" />
    </svg>
  );
}

export function TapeGround() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden text-ink opacity-[0.06]">
      <GroundReel className="-top-24 -right-28 h-[22rem] w-[22rem] md:-top-32 md:-right-24 md:h-[34rem] md:w-[34rem]" />
      <GroundReel className="reverse -bottom-24 -left-20 hidden h-[24rem] w-[24rem] md:block md:left-40" />
    </div>
  );
}
