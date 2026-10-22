'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { importCsv } from './actions';

/** UTF-8 when the bytes are valid UTF-8; otherwise Excel's default "CSV (Comma delimited)" encoding, Windows-1252. */
async function readText(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('windows-1252').decode(bytes); }
}

const MAX_BYTES = 1_000_000; // matches the server action's limit
const SHOW_ROWS = 5;

const list = (ns: number[]) => (ns.length === 1 ? `${ns[0]}` : `${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`);
const inDeckNote = (n: number) => (n ? `${n} already in this deck.` : '');
const inFileNote = (n: number) => (n ? `${n} repeated in the file.` : '');
function skippedNote(rows: number[]): string {
  if (!rows.length) return '';
  const shown = rows.slice(0, SHOW_ROWS);
  const more = rows.length > SHOW_ROWS ? ` and ${rows.length - SHOW_ROWS} more` : '';
  return `Skipped ${rows.length === 1 ? 'row' : 'rows'} ${list(shown)}${more}: a front or back was empty or over 500 characters.`;
}

/** B4.5: bring cards in from a CSV, take them out as CSV or Anki text. */
export function Transfer({ deckId }: { deckId: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function pick(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = ''; // so picking the same file again still imports
    setNote(''); setError('');
    if (!file) return;
    if (file.size > MAX_BYTES) { setError('Choose a CSV under 1 MB.'); return; } // checked before reading the whole file
    setBusy(true);
    const r = await importCsv(deckId, await readText(file)).catch(() => ({ ok: false as const, message: "We couldn't import those cards. Try again." }));
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setNote([`Added ${r.added} ${r.added === 1 ? 'card' : 'cards'}.`, inDeckNote(r.inDeck), inFileNote(r.inFile), skippedNote(r.skippedRows)].filter(Boolean).join(' '));
    router.refresh();
  }

  return (
    <section aria-labelledby="transfer-h" className="mb-8 max-w-prose space-y-3">
      <h2 id="transfer-h" className="text-xl font-bold">Import and export</h2>
      <div>
        <label htmlFor="csv-file" className="mb-1 block">Import cards from a CSV file</label>
        <input id="csv-file" type="file" accept=".csv,text/csv" className="field" disabled={busy}
          aria-describedby="csv-help" onChange={(e) => void pick(e.target)} />
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
