'use client';

import { useState, useTransition } from 'react';
import { exportMyData } from '@/lib/account/export';
import { createClient } from '@/lib/supabase/client';
import { clearDeviceData } from '@/review/client-sync';
import { deleteMyData } from './actions';

/** Brief E4: students can export and delete their data. The export is built in the browser, through RLS. */
export function YourData() {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, startDelete] = useTransition();

  async function download() {
    setDownloading(true);
    setDownloadError('');
    const data = await exportMyData(createClient()).catch(() => null);
    setDownloading(false);
    if (!data) return setDownloadError("We couldn't gather your data. Try again in a minute.");
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `scholar-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onDelete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (String(form.get('confirm')).trim().toLowerCase() !== 'delete') return setDeleteError('Type delete to confirm.');
    setDeleteError('');
    startDelete(async () => {
      // Cleared first: a successful delete redirects, so nothing runs after it. The cache refills from the server if the delete fails.
      await clearDeviceData();
      setDeleteError(await deleteMyData(form));
    });
  }

  return (
    <section aria-labelledby="your-data" className="mt-8 max-w-prose space-y-6 inlay p-6">
      <h2 id="your-data" className="hand text-2xl">Your data</h2>
      <p><a href="/privacy" className="underline">Read what Scholar keeps and who sees it</a>.</p>
      <div className="space-y-2">
        <p>Download everything you have in Scholar (essays, drafts, feedback, cards and reviews) as one JSON file.</p>
        <button type="button" className="btn" disabled={downloading} onClick={download}>
          {downloading ? 'Gathering your data…' : 'Download my data'}
        </button>
        {downloadError && <p role="alert" className="error">{downloadError}</p>}
      </div>
      <form className="space-y-2" onSubmit={onDelete}>
        <h3 className="font-bold">Delete my data</h3>
        <p>This permanently deletes your essays, drafts, feedback, decks, cards and reviews, then signs you out. It can&apos;t be undone.
          Download a copy first if you want one. You can still sign in later and start fresh.</p>
        <label htmlFor="confirm-delete" className="block font-bold">Type delete to confirm</label>
        <input id="confirm-delete" name="confirm" className="field" autoComplete="off"
          aria-invalid={deleteError ? true : undefined} aria-describedby={deleteError ? 'delete-err' : undefined} />
        <button type="submit" className="btn" disabled={deleting}>{deleting ? 'Deleting…' : 'Delete my data'}</button>
        {deleteError && <p id="delete-err" role="alert" className="error">{deleteError}</p>}
      </form>
    </section>
  );
}
