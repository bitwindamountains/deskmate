'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { PageText } from '@/chunk';
import { MAX_PAGES, validateImport } from '@/lib/import/validate';
import { createSource } from './actions';

const NEW = '__new';

export function ImportForm({ decks }: { decks: { id: string; title: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [pdf, setPdf] = useState<{ name: string; pages: PageText[] } | null>(null);
  const [text, setText] = useState('');
  const [deck, setDeck] = useState(decks[0]?.id ?? NEW);
  const [newTitle, setNewTitle] = useState('');
  const [examDate, setExamDate] = useState('');
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(MAX_PAGES);

  async function pick(file?: File) {
    setError('');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) return setError('Choose a PDF file.');
    try {
      const { extractPdfPages } = await import('@/lib/import/pdf');
      const pages = await extractPdfPages(file);
      setPdf({ name: file.name, pages });
      setFrom(1);
      setTo(Math.min(pages.length, MAX_PAGES));
    } catch {
      setPdf(null);
      setError("We couldn't read that PDF. Try another file or paste the text instead.");
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    let pages: PageText[];
    if (pdf) {
      if (!(from >= 1 && to >= from && to <= pdf.pages.length)) return setError(`Choose pages between 1 and ${pdf.pages.length}.`);
      pages = pdf.pages.slice(from - 1, to);
    } else pages = [{ page: 1, text }];
    const input = {
      ...(deck === NEW ? { newDeckTitle: newTitle, examDate: examDate || undefined } : { deckId: deck }),
      title: pdf ? pdf.name.replace(/\.pdf$/i, '') : 'Pasted text',
      kind: pdf ? ('pdf' as const) : ('text' as const),
      pages,
    };
    const v = validateImport(input);
    if (!v.ok) return setError(v.error);
    setError('');
    start(async () => {
      const r = await createSource(input);
      if (r.ok) router.push(`/study/triage/${r.sourceId}`);
      else setError(r.error);
    });
  }

  const bad = error ? { 'aria-invalid': true, 'aria-describedby': 'import-err' } : {};
  return (
    <form onSubmit={submit} className="max-w-md space-y-5">
      {error && <p id="import-err" role="alert" className="error">{error}</p>}

      <div>
        <label htmlFor="pdf" className="mb-1 block">PDF file</label>
        <input id="pdf" type="file" accept=".pdf,application/pdf" className="field" onChange={(e) => pick(e.target.files?.[0])}
          onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }} onDragOver={(e) => e.preventDefault()} />
        {pdf && <p className="mt-1">{pdf.name}: {pdf.pages.length} pages</p>}
      </div>

      {pdf && pdf.pages.length > MAX_PAGES && (
        <fieldset className="flex items-end gap-3">
          <legend className="mb-1">Pick up to {MAX_PAGES} pages</legend>
          <div>
            <label htmlFor="from" className="mb-1 block">Pages from</label>
            <input id="from" type="number" min={1} max={pdf.pages.length} value={from} onChange={(e) => setFrom(+e.target.value)} className="field" />
          </div>
          <div>
            <label htmlFor="to" className="mb-1 block">to</label>
            <input id="to" type="number" min={1} max={pdf.pages.length} value={to} onChange={(e) => setTo(+e.target.value)} className="field" />
          </div>
        </fieldset>
      )}

      {pdf ? (
        <button type="button" className="btn" onClick={() => setPdf(null)}>Remove PDF</button>
      ) : (
        <div>
          <label htmlFor="paste" className="mb-1 block">Paste text</label>
          <textarea id="paste" rows={8} value={text} onChange={(e) => setText(e.target.value)} className="field" {...bad} />
        </div>
      )}

      <div>
        <label htmlFor="deck" className="mb-1 block">Deck</label>
        <select id="deck" value={deck} onChange={(e) => setDeck(e.target.value)} className="field">
          {decks.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          <option value={NEW}>New deck…</option>
        </select>
      </div>
      {deck === NEW && (
        <>
          <div>
            <label htmlFor="new-deck" className="mb-1 block">New deck name</label>
            <input id="new-deck" maxLength={120} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="field" />
          </div>
          <div>
            <label htmlFor="exam" className="mb-1 block">Exam date (optional)</label>
            <input id="exam" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className="field" />
          </div>
        </>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary">Make flashcards</button>
    </form>
  );
}
