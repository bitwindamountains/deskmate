import { compareSelf, type SelfAssessment, type SelfScore } from '@/lib/essay/self-check';

/** A3.7: the student's own rating next to the coach's, once the big-picture layer has scored the essay. */
export function SelfCheck({ self, ai, topSummary, showScores }: { self: SelfAssessment; ai: SelfScore[]; topSummary: string | null; showScores: boolean }) {
  const { rows, within, of } = compareSelf(self.scores, ai);
  return (
    <section aria-labelledby="self-h" className="space-y-3">
      <h2 id="self-h" className="text-xl font-bold">Your rating and the coach&apos;s</h2>
      {showScores && of > 0 && (
        <>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line"><th scope="col" className="py-2">Criterion</th><th scope="col" className="py-2">You</th><th scope="col" className="py-2">Coach</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.criterion} className="border-b border-line/40">
                  <th scope="row" className="py-2 font-normal">{r.criterion}</th>
                  <td className="py-2">{r.self ?? '–'}</td>
                  <td className="py-2">{r.ai ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>{`You were within one point on ${within} of ${of} ${of === 1 ? 'criterion' : 'criteria'}.`}</p>
        </>
      )}
      {self.weakness && (
        <dl className="space-y-2 [overflow-wrap:anywhere]">
          <div><dt className="text-sm font-bold text-ink-muted">You said your biggest weakness is</dt><dd>{self.weakness}</dd></div>
          {topSummary && <div><dt className="text-sm font-bold text-ink-muted">The coach&apos;s top priority</dt><dd>{topSummary}</dd></div>}
        </dl>
      )}
    </section>
  );
}
