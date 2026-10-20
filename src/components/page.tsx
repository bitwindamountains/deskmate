import { Nav, type NavKey } from './nav';

// Every (app) page: nav first, then the main landmark the skip link targets.
export function AppPage({ current, title, children }: { current: NavKey; title: string; children: React.ReactNode }) {
  return (
    <>
      <Nav current={current} />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 outline-none px-4 pt-8 pb-28 md:px-10 md:pt-12 md:pb-12">
        <h1 className="mb-6 text-[1.728rem] leading-tight font-bold text-balance">{title}</h1>
        {children}
      </main>
    </>
  );
}
