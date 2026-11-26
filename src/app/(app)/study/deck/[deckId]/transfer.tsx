'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { type ImportResult } from '@/lib/cards/transfer';
import { importAnki, importCsv } from './actions';

/** UTF-8 when the bytes are valid UTF-8; otherwise Excel's default "CSV (Comma delimited)" encoding, Windows-1252. */
async function readText(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('windows-1252').decode(bytes); }
}

const MAX_BYTES = 1_000_000; // matches the server action's limit
const MAX_APKG_BYTES = 100_000_000; // media makes packages big; only the collection file inside is read
const SQL_WASM = '/vendor/sql-wasm-1.17.0.wasm';
const ANKI_BATCH = 500; // 500 cards of 500-character sides stay under the 1 MB server action limit
const FAILED = { ok: false as const, message: "We couldn't import those cards. Try again." };
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
const skippedNotes = (n: number) => (n ? `Skipped ${n} ${n === 1 ? 'note' : 'notes'}: a side was empty or over 500 characters.` : '');

/** An .apkg is unzipped and read here, on the device; only its cards go to the server. */
async function importApkg(deckId: string, file: File): Promise<{ r: ImportResult; skipped: number }> {
  const { readApkg } = await import('@/lib/cards/apkg'); // loaded only when a package is picked
  const read = await readApkg(new Uint8Array(await file.arrayBuffer()), SQL_WASM);
  if (read.error) return { r: { ok: false, message: read.error }, skipped: 0 };
  if (!read.cards.length) return { r: { ok: false, message: 'That package has no cards Deskmate can use.' }, skipped: 0 };
  const total = { ok: true as const, added: 0, skippedRows: [] as number[], inDeck: 0, inFile: 0 };
  for (let i = 0; i < read.cards.length; i += ANKI_BATCH) {
    const r = await importAnki(deckId, read.cards.slice(i, i + ANKI_BATCH));
    if (!r.ok) return { r: total.added ? { ...r, message: `Added ${total.added} cards, then: ${r.message}` } : r, skipped: read.skipped };
    total.added += r.added; total.inDeck += r.inDeck; total.inFile += r.inFile;
  }
  return { r: total, skipped: read.skipped };
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
    const anki = /\.apkg$/i.test(file.name);
    // checked before reading the whole file
    if (anki && file.size > MAX_APKG_BYTES) { setError('Choose an Anki package under 100 MB.'); return; }
    if (!anki && file.size > MAX_BYTES) { setError('Choose a CSV under 1 MB.'); return; }
    setBusy(true);
    const { r, skipped } = await (anki ? importApkg(deckId, file) : importCsv(deckId, await readText(file)).then((r) => ({ r, skipped: 0 })))
      .catch(() => ({ r: FAILED, skipped: 0 }));
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setNote([`Added ${r.added} ${r.added === 1 ? 'card' : 'cards'}.`, inDeckNote(r.inDeck), inFileNote(r.inFile), skippedNote(r.skippedRows), skippedNotes(skipped)]
      .filter(Boolean).join(' '));
    router.refresh();
  }

  return (
    <section aria-labelledby="transfer-h" className="mb-8 max-w-prose space-y-3">
      <h2 id="transfer-h" className="hand text-2xl">Import and export</h2>
      <div>
        <label htmlFor="csv-file" className="mb-1 block">Import cards from a CSV or Anki file</label>
        <input id="csv-file" type="file" accept=".csv,text/csv,.apkg" className="field" disabled={busy}
          aria-describedby="csv-help" onChange={(e) => void pick(e.target)} />
        <p id="csv-help" className="mt-1 text-sm text-ink-muted">A CSV needs a first row with &quot;front&quot; and &quot;back&quot; columns (&quot;concept&quot; and &quot;type&quot; are optional). From Anki, choose a deck package (.apkg); images and sounds are left out.</p>
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
