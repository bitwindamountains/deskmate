import Link from 'next/link';

const ITEMS = [
  { key: 'today', label: 'Today', href: '/today' },
  { key: 'study', label: 'Study', href: '/study' },
  { key: 'write', label: 'Write', href: '/write' },
  { key: 'progress', label: 'Progress', href: '/progress' },
  { key: 'profile', label: 'Profile', href: '/profile' },
] as const;

export type NavKey = (typeof ITEMS)[number]['key'];

// Bottom tab bar on phones, the J-card's spine from 768px. The current item is red, bold and marked by the brand
// stripe (shape, weight and aria-current, so colour is never the only signal; DESIGN.md).
export function Nav({ current }: { current: NavKey }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 border-t-[1.5px] border-ink bg-rail pb-[env(safe-area-inset-bottom)] md:sticky md:top-0 md:h-dvh md:w-56 md:shrink-0 md:border-t-0 md:border-r-[1.5px] md:px-3 md:py-6"
    >
      <p className="hand hidden items-center gap-3 px-3 pb-6 text-2xl text-rail-ink-strong md:flex">Scholar <span className="stripe" aria-hidden="true" /></p>
      <ul className="grid grid-cols-5 md:flex md:flex-col md:gap-1">
        {ITEMS.map((item) => {
          const here = item.key === current;
          return (
            <li key={item.key} className="flex">
              <Link
                href={item.href}
                aria-current={here ? 'page' : undefined}
                className={`relative m-1 flex min-h-11 flex-1 items-center justify-center gap-2 px-1 text-sm transition-colors duration-150 md:m-0 md:justify-start md:px-3 md:text-base ${
                  here ? 'font-bold text-accent' : 'text-rail-ink hover:text-rail-ink-strong hover:underline'
                }`}
              >
                {here && <span className="absolute inset-x-3 top-0 h-[3px] bg-accent md:hidden" aria-hidden="true" />}
                {here && <span className="stripe hidden md:inline-block" aria-hidden="true" />}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
