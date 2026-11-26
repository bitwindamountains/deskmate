const ERRORS: Record<string, string> = {
  busy: "You've started several demos in the last hour. Try again a little later.",
  failed: "The demo couldn't start. Try again in a minute.",
};

/** Demo mode's sign-in page: one button that makes a fresh sample account (POST /api/demo). Real sign-in is off. */
export function DemoStart({ error }: { error?: string }) {
  const message = error ? ERRORS[error] ?? ERRORS.failed : null;
  return (
    <div className="space-y-5">
      <h2 className="hand text-2xl leading-tight">Try the full app</h2>
      <p className="text-pretty">
        The demo opens a private sample account: two decks of cards from class notes, a week of reviews, and an essay with
        feedback. AI features are off, and the account is deleted after a day.
      </p>
      {message && <p role="alert" className="error">{message}</p>}
      <form method="post" action="/api/demo">
        <button type="submit" className="btn btn-primary w-full">Try the demo</button>
      </form>
      <p className="text-sm text-ink-muted">The first start can take a minute while the server wakes up.</p>
      <p className="text-sm text-ink-muted"><a href="/privacy" className="underline">How Deskmate handles your data</a></p>
    </div>
  );
}
