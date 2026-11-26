import { CardStackHero } from '@/components/card-stack';

const ERRORS: Record<string, string> = {
  busy: "You've started several demos in the last hour. Try again a little later.",
  failed: "The demo couldn't start. Try again in a minute.",
};

/** Demo mode's sign-in page: one button that makes a fresh sample account (POST /api/demo). Real sign-in is off. */
export function DemoStart({ error }: { error?: string }) {
  const message = error ? ERRORS[error] ?? ERRORS.failed : null;
  return (
    <main className="mx-auto max-w-sm space-y-6 px-4 py-10">
      <CardStackHero />
      <h1 className="hand rule-draw pb-1 text-[2.25rem] leading-tight text-balance"><span className="hand-write">Try Deskmate</span></h1>
      <p className="text-pretty">
        Deskmate helps you study without doing the work for you. Draft Coach gives feedback on your essays, with hints instead
        of rewrites. Recall turns your notes into flashcards and schedules each review before you forget.
      </p>
      <p className="text-pretty">
        This demo opens a private sample account: two decks of cards from class notes, a week of reviews, and an essay with
        feedback. Review cards, sort new ones, and open the essay feedback. AI features are off, and the account is deleted
        after a day.
      </p>
      {message && <p role="alert" className="error">{message}</p>}
      <form method="post" action="/api/demo">
        <button type="submit" className="btn btn-primary w-full">Try the demo</button>
      </form>
      <p className="text-sm text-ink-muted">The first start can take a minute while the server wakes up.</p>
      <p className="text-sm text-ink-muted"><a href="/privacy" className="underline">How Deskmate handles your data</a></p>
    </main>
  );
}
