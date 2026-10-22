import Link from 'next/link';

const ITEMS = [
  { key: 'today', label: 'Today', href: '/today' },
  { key: 'study', label: 'Study', href: '/study' },
  { key: 'write', label: 'Write', href: '/write' },
  { key: 'progress', label: 'Progress', href: '/progress' },
  { key: 'profile', label: 'Profile', href: '/profile' },
] as const;

export type NavKey = (typeof ITEMS)[number]['key'];

// Bottom tab bar on phones, sidebar from 768px. The current item wears the highlighter mark (DESIGN.md).
export function Nav({ current }: { current: NavKey }) {
  return (
    <nav
      aria-label="Main"
      className="rail fixed inset-x-0 bottom-0 z-10 bg-rail pb-[env(safe-area-inset-bottom)] md:sticky md:top-0 md:h-dvh md:w-56 md:shrink-0 md:px-3 md:py-6"
    >
      <p className="hidden px-3 pb-6 text-lg font-bold text-rail-ink-strong md:block">Scholar</p>
      <ul className="grid grid-cols-5 md:flex md:flex-col md:gap-1">
        {ITEMS.map((item) => {
          const here = item.key === current;
          return (
            <li key={item.key} className="flex">
              <Link
                href={item.href}
                aria-current={here ? 'page' : undefined}
                className={`m-1 flex min-h-11 flex-1 items-center justify-center rounded-[0.3rem_0.8rem_0.35rem_0.7rem] px-1 text-sm transition-colors md:px-3 md:text-base duration-150 md:m-0 md:justify-start ${
                  here ? 'bg-mark font-bold text-on-mark' : 'text-rail-ink hover:bg-white/10 hover:text-rail-ink-strong'
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
