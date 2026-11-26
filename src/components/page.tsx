import { Nav, type NavKey } from './nav';

// Every (app) page: nav first, then the main landmark the skip link targets.
// wide: two-column screens (the essay beside its feedback) need more than the 48rem reading column.
export function AppPage({ current, title, wide = false, children }: { current: NavKey; title: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <>
      {/* React hoists this into <head>; the root layout sets no title, so it is the only one (WCAG 2.4.2). */}
      <title>{`${title} · Deskmate`}</title>
      <Nav current={current} />
      <main id="main" tabIndex={-1} className={`mx-auto w-full ${wide ? 'max-w-6xl' : 'max-w-3xl'} flex-1 outline-none px-4 pt-8 pb-28 md:px-10 md:pt-12 md:pb-12`}>
        <h1 className="hand rule-draw pb-1 text-[2.25rem] leading-tight text-balance md:text-[3rem]"><span className="hand-write">{title}</span></h1>
        {children}
      </main>
    </>
  );
}
