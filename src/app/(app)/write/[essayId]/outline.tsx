export type OutlineLine = { paragraph_index: number; summary: string; flag: 'repeats' | 'off_topic' | 'order' | null };

const FLAG: Record<NonNullable<OutlineLine['flag']>, string> = {
  repeats: 'Repeats an earlier point', off_topic: 'Drifts from your thesis', order: 'Might fit better elsewhere',
};

/** Reverse outline (A3.2): one line per paragraph, linking to it. */
export function Outline({ lines }: { lines: OutlineLine[] }) {
  return (
    <section aria-labelledby="outline-h" className="mt-8 max-w-prose space-y-3">
      <h2 id="outline-h" className="hand text-2xl">Paragraph outline</h2>
      <ol className="space-y-2 [overflow-wrap:anywhere]">
        {lines.map((l) => (
          <li key={l.paragraph_index}>
            <a href={`#para-${l.paragraph_index}`} className="underline">{`P${l.paragraph_index + 1}: ${l.summary}`}</a>
            {l.flag && <span className="ml-2 rounded-md border border-line px-2 text-sm font-bold">{FLAG[l.flag]}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
