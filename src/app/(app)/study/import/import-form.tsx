'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import type { PageText } from '@/chunk';
import { extractEssayFile } from '@/lib/essay/extract';
import { MAX_PAGES, validateImport } from '@/lib/import/validate';
import { createSource } from './actions';

const NEW = '__new';

export function ImportForm({ decks }: { decks: { id: string; title: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setErrorMsg] = useState('');
  const [errField, setErrField] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const picks = useRef(0); // reading a file is async: only the latest pick may change the form
  const setError = (msg: string, field = '') => { setErrorMsg(msg); setErrField(msg ? field : ''); };
  const [pdf, setPdf] = useState<{ name: string; pages: PageText[] } | null>(null);
  const [text, setText] = useState('');
  const [docName, setDocName] = useState(''); // a Word file's name, once its text is in the box
  const [deck, setDeck] = useState(decks[0]?.id ?? NEW);
  const [newTitle, setNewTitle] = useState('');
  const [examDate, setExamDate] = useState('');
  const [density, setDensity] = useState<'fewer' | 'standard' | 'more'>('standard');
  const [types, setTypes] = useState<('basic' | 'cloze' | 'why')[]>(['basic', 'cloze', 'why']);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(MAX_PAGES);

  async function pick(file?: File) {
    setError('');
    if (!file) return;
    const pick = ++picks.current;
    if (file.name.toLowerCase().endsWith('.docx')) {
      // A Word file has no pages to pick from, so its text goes in the box like pasted notes, after anything already there.
      const r = await extractEssayFile(file);
      if (pick !== picks.current) return;
      if (!r.ok) return setError(r.error, 'pdf');
      setPdf(null);
      setText((t) => (t.trim() ? `${t.trimEnd()}\n\n${r.text}` : r.text));
      setDocName(file.name);
      return;
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) return setError('Choose a PDF or Word (.docx) file.', 'pdf');
    try {
      const { extractPdfPages } = await import('@/lib/import/pdf');
      const pages = await extractPdfPages(file);
      if (pick !== picks.current) return;
      setPdf({ name: file.name, pages });
      setFrom(1);
      setTo(Math.min(pages.length, MAX_PAGES));
    } catch {
      if (pick !== picks.current) return;
      setPdf(null);
      setError("We couldn't read that PDF. Try another file or paste the text instead.", 'pdf');
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    let pages: PageText[];
    if (pdf) {
      if (!(from >= 1 && to >= from && to <= pdf.pages.length)) return setError(`Choose pages between 1 and ${pdf.pages.length}.`, 'from');
      pages = pdf.pages.slice(from - 1, to);
    } else pages = [{ page: 1, text }];
    const input = {
      ...(deck === NEW ? { newDeckTitle: newTitle, examDate: examDate || undefined } : { deckId: deck }),
      title: (pdf ? pdf.name.replace(/\.pdf$/i, '') : docName.replace(/\.docx$/i, '')).slice(0, 120) || (pdf ? 'PDF' : 'Pasted text'),
      kind: pdf ? ('pdf' as const) : ('text' as const),
      pages,
      cardDensity: density,
      cardTypes: types,
    };
    if (!types.length) return setError('Pick at least one card type.', 'types');
    const v = validateImport(input);
    if (!v.ok) {
      const m = v.error;
      return setError(m, m.startsWith('Choose a deck') ? 'new-deck' : m.startsWith('Pick up to') ? 'from' : pdf ? 'pdf' : 'paste');
    }
    setError('');
    start(async () => {
      try {
        const r = await createSource(input);
        if (r.ok) router.push(`/study/triage/${r.sourceId}`);
        else setError(r.error);
      } catch {
        setError("We couldn't save your material. Please try again.");
      }
    });
  }

  const bad = (id: string) => (error && errField === id ? { 'aria-invalid': true, 'aria-describedby': 'import-err' } : {});
  return (
    <form onSubmit={submit} className="max-w-md space-y-5">
      {error && <p id="import-err" role="alert" className="error">{error}</p>}

      <div>
        <label htmlFor="pdf" className="mb-1 block">PDF or Word file</label>
        <input ref={fileRef} id="pdf" type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="field" {...bad('pdf')} onChange={(e) => pick(e.target.files?.[0])}
          onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }} onDragOver={(e) => e.preventDefault()} />
        {/* Always rendered, so screen readers announce the file once it has been read (WCAG 4.1.3). */}
        <div role="status">
          {pdf && <p className="mt-1">{pdf.name}: {pdf.pages.length} pages</p>}
          {!pdf && docName && <p className="mt-1">{docName}: its text is in the box below, where you can edit it.</p>}
        </div>
      </div>

      {pdf && pdf.pages.length > MAX_PAGES && (
        <fieldset className="flex items-end gap-3">
          <legend className="mb-1">Pick up to {MAX_PAGES} pages</legend>
          <div>
            <label htmlFor="from" className="mb-1 block">Pages from</label>
            <input id="from" type="number" min={1} max={pdf.pages.length} value={from} onChange={(e) => setFrom(+e.target.value)} className="field" {...bad('from')} />
          </div>
          <div>
            <label htmlFor="to" className="mb-1 block">to</label>
            <input id="to" type="number" min={1} max={pdf.pages.length} value={to} onChange={(e) => setTo(+e.target.value)} className="field" {...bad('from')} />
          </div>
        </fieldset>
      )}

      {pdf ? (
        <button type="button" className="btn" onClick={() => { setPdf(null); if (fileRef.current) fileRef.current.value = ''; }}>Remove PDF</button>
      ) : (
        <div>
          <label htmlFor="paste" className="mb-1 block">Paste text</label>
          <textarea id="paste" rows={8} value={text} onChange={(e) => { setText(e.target.value); if (!e.target.value.trim()) setDocName(''); }} className="field" {...bad('paste')} />
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
            <input id="new-deck" maxLength={120} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="field" {...bad('new-deck')} />
          </div>
          <div>
            <label htmlFor="exam" className="mb-1 block">Exam date (optional)</label>
            <input id="exam" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className="field" />
          </div>
        </>
      )}

      <fieldset>
        <legend className="mb-1">How many cards?</legend>
        {([['fewer', 'Fewer: core ideas only'], ['standard', 'Standard'], ['more', 'More: supporting ideas too']] as const).map(([v, label]) => (
          <label key={v} className="flex min-h-11 items-center gap-2">
            <input type="radio" name="density" value={v} checked={density === v} onChange={() => setDensity(v)} /> {label}
          </label>
        ))}
      </fieldset>

      <fieldset {...(errField === 'types' ? { 'aria-describedby': 'import-err' } : {})}>
        <legend className="mb-1">Card types</legend>
        {([['basic', 'Q&A'], ['cloze', 'Fill in the blank'], ['why', 'Explain why']] as const).map(([v, label]) => (
          <label key={v} className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={types.includes(v)}
              onChange={() => setTypes((t) => (t.includes(v) ? t.filter((x) => x !== v) : (['basic', 'cloze', 'why'] as const).filter((x) => x === v || t.includes(x))))} /> {label}
          </label>
        ))}
      </fieldset>

      <button type="submit" disabled={pending} className="btn btn-primary">Make flashcards</button>
    </form>
  );
}
