'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { importCsv } from './actions';

/** B4.5: bring cards in from a CSV, take them out as CSV or Anki text. */
export function Transfer({ deckId }: { deckId: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function pick(file?: File) {
    setNote(''); setError('');
    if (!file) return;
    setBusy(true);
    const r = await importCsv(deckId, await file.text()).catch(() => ({ ok: false as const, message: "We couldn't import those cards. Try again." }));
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    const skipped = r.skipped ? ` Skipped ${r.skipped} ${r.skipped === 1 ? 'row' : 'rows'} without a front and back.` : '';
    setNote(`Added ${r.added} ${r.added === 1 ? 'card' : 'cards'}.${skipped}`);
    router.refresh();
  }

  return (
    <section aria-labelledby="transfer-h" className="mb-8 max-w-prose space-y-3">
      <h2 id="transfer-h" className="text-xl font-bold">Import and export</h2>
      <div>
        <label htmlFor="csv-file" className="mb-1 block">Import cards from a CSV file</label>
        <input id="csv-file" type="file" accept=".csv,text/csv" className="field" disabled={busy}
          aria-describedby="csv-help" onChange={(e) => void pick(e.target.files?.[0])} />
        <p id="csv-help" className="mt-1 text-sm text-ink-muted">The first row needs &quot;front&quot; and &quot;back&quot; columns; &quot;concept&quot; and &quot;type&quot; are optional.</p>
      </div>
      <p role="status" className="empty:hidden">{busy ? 'Importing…' : note}</p>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <a href={`/api/decks/${deckId}/export?format=csv`} className="btn">Export CSV</a>
        <a href={`/api/decks/${deckId}/export?format=anki`} className="btn">Export for Anki</a>
      </div>
    </section>
  );
}
