import Link from 'next/link';

export function EmptyStudy({ level = 2 }: { level?: 2 | 3 }) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <section className="max-w-prose rounded-xl border border-line bg-surface p-6">
      <H className="text-xl font-bold text-balance">Nothing to study yet</H>
      <p className="mt-2 text-ink-muted">Turn your notes into a few good flashcards.</p>
      <Link href="/study/import" className="btn btn-primary mt-6">Import material</Link>
    </section>
  );
}
