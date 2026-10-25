export type AlignmentPart = { part: string; status: 'addressed' | 'partial' | 'missing'; note: string };

const LABEL: Record<AlignmentPart['status'], string> = { addressed: 'Covered', partial: 'Partly covered', missing: 'Not yet' };

/** Prompt alignment checklist (A3.3): each part the assignment asks for, with a text status. */
export function Alignment({ parts }: { parts: AlignmentPart[] }) {
  return (
    <section aria-labelledby="alignment-h" className="space-y-3">
      <h2 id="alignment-h" className="hand text-2xl">What the assignment asks</h2>
      <ul className="divide-y divide-line/40 inlay px-4 [overflow-wrap:anywhere]">
        {parts.map((p, k) => (
          <li key={k} className="space-y-1 py-3">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{p.part}</span>
              <span className="rounded-md border border-line px-2 text-sm font-bold">{LABEL[p.status]}</span>
            </p>
            {p.note && <p className="text-ink-muted">{p.note}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
