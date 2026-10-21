'use client';

import { useState } from 'react';
import { clearDeviceData, unsyncedReviews } from '@/review/client-sync';

// Clears this device's cached cards and offline pages before signing out, so a shared device keeps nothing of this user's.
export function SignOut() {
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    const left = await unsyncedReviews();
    const n = `${left} ${left === 1 ? 'review' : 'reviews'}`;
    if (left && !window.confirm(`${n} on this device couldn't be saved yet. Signing out will lose them. Sign out anyway?`)) {
      setBusy(false);
      return;
    }
    await clearDeviceData();
    form.submit();
  }
  return (
    <form method="post" action="/auth/signout" className="mt-8" onSubmit={onSubmit}>
      <button type="submit" className="btn" disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button>
    </form>
  );
}
