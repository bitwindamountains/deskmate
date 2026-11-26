import { TryCard } from './try-card';

/**
 * Sign-in (owner, 2026-11-27, direction A): / leads here, so this is where a visitor learns what Deskmate is. Rather than
 * describe it, the page hands them a card to answer. DOM order is reading and tab order: heading, the form, then the card;
 * from 768px the heading and card share the left column and the form sits on the right.
 */
export function SignInShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-[minmax(0,1fr)_22rem] md:gap-x-16 md:py-16">
      <header className="space-y-4 md:col-start-1 md:row-start-1">
        <p className="hand flex items-center gap-3 text-2xl">Deskmate <span className="stripe" aria-hidden="true" /></p>
        <h1 className="hand rule-draw pb-1 text-[2.5rem] leading-[1.05] text-balance md:text-[3.25rem]">
          <span className="hand-write">Study a little. Remember it for good.</span>
        </h1>
        <p className="max-w-prose text-pretty">
          Deskmate helps you study without doing the work for you: hints on your essays instead of rewrites, and flashcards from
          your own notes, each brought back just before you&apos;d forget it. Free beta for students 18 and over.
        </p>
      </header>
      <div className="md:col-start-2 md:row-span-2 md:row-start-1 md:pt-14">{children}</div>
      <div className="max-w-lg md:col-start-1 md:row-start-2"><TryCard /></div>
    </main>
  );
}
