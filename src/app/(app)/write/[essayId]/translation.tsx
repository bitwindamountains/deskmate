'use client';

import { useEffect, useState } from 'react';

export type Lang = 'fil' | 'es';
export type Translated = { summary: string; hints: string[] };

export const LANGUAGE_NAME: Record<Lang, string> = { fil: 'Filipino', es: 'Spanish' };

/** A3.9: the item explained in the student's first language, under the English. Re-asks when another hint is revealed. */
export function Translation({ lang, shown, translate }: { lang: Lang; shown: number; translate: () => Promise<Translated | string> }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ level: number; data: Translated } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || result?.level === shown) return;
    let live = true;
    setBusy(true);
    setError('');
    translate().then((r) => {
      if (!live) return;
      setBusy(false);
      if (typeof r === 'string') setError(r);
      else setResult({ level: shown, data: r });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- translate is a fresh closure each render; open and shown drive it
  }, [open, shown]);

  return (
    <div className="space-y-2">
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{`Explain in ${LANGUAGE_NAME[lang]}`}</button>
      {open && (
        <div className="space-y-2">
          <p role="status" className="empty:hidden">{busy ? 'Translating…' : ''}</p>
          {error && <p role="alert" className="error">{error}</p>}
          {result && (
            <div lang={lang} className="space-y-2 rounded-lg border border-line p-3">
              <p>{result.data.summary}</p>
              {result.data.hints.length > 0 && <ol className="list-decimal space-y-1 pl-5">{result.data.hints.map((h, k) => <li key={k}>{h}</li>)}</ol>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
