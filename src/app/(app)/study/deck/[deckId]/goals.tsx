'use client';

import { useState } from 'react';
import { getEmbedder } from '@/lib/embed/embed';
import { goalLines, matchGoals } from '@/review/goals';
import { saveGoals } from './actions';

const BATCH = 32;
const MAX_MATCHES = 2000; // set_goal_matches takes at most this many ids
const NO_MODEL = "Goals saved. Matching cards needs a model download that didn't finish; try again later.";

/** B4.3: the student pastes course goals; cards are matched to them on the device, and matched cards come up sooner. */
export function Goals({ deckId, goals, cards }: { deckId: string; goals: string; cards: { id: string; front: string; back: string }[] }) {
  const [text, setText] = useState(goals);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0); // cards embedded so far, for the progress line

  /** Card ids matching the goals, [] when there are no goal lines, null when the model can't load. */
  async function match(): Promise<string[] | null> {
    const lines = goalLines(text);
    if (!lines.length || !cards.length) return [];
    const embed = await getEmbedder();
    if (!embed) return null;
    const goalVecs = await embed(lines);
    const vecs: number[][] = [];
    for (let i = 0; i < cards.length; i += BATCH) {
      vecs.push(...await embed(cards.slice(i, i + BATCH).map((c) => `${c.front}\n${c.back}`)));
      setDone(vecs.length);
    }
    // ponytail: past 2,000 matches the rest of the deck goes without the boost; rank by closeness if decks get that big.
    return matchGoals(goalVecs, cards.map((c, i) => ({ id: c.id, vec: vecs[i] }))).slice(0, MAX_MATCHES);
  }

  async function save() {
    setNote(''); setError(''); setDone(0); setBusy(true);
    const matched = await match().catch(() => null);
    const r = await saveGoals(deckId, text, matched).catch(() => ({ ok: false as const, message: "We couldn't save your goals." }));
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    if (matched === null) setNote(NO_MODEL);
    else if (!text.trim()) setNote('Goals cleared.');
    else if (!goalLines(text).length) setNote('Goals saved. Write each goal on its own line, at least three words, to match cards.');
    else setNote(`${r.matched} of ${cards.length} ${cards.length === 1 ? 'card matches' : 'cards match'} your course goals.`);
  }

  return (
    <section aria-labelledby="goals-h" className="mb-8 max-w-prose space-y-3">
      <h2 id="goals-h" className="hand text-2xl">Course goals</h2>
      <div>
        <label htmlFor="goals-text" className="mb-1 block">Paste your syllabus, learning objectives or past exam questions</label>
        <textarea id="goals-text" className="field min-h-32 w-full" maxLength={5000} value={text} disabled={busy}
          aria-describedby="goals-help" onChange={(e) => setText(e.target.value)} />
        <p id="goals-help" className="mt-1 text-sm text-ink-muted">Matched cards come up sooner in reviews. Save again after adding cards.</p>
      </div>
      <button type="button" className="btn" disabled={busy} onClick={() => void save()}>Save and match cards</button>
      <p role="status" className="empty:hidden">{busy ? `Matching cards…${done ? ` ${done} of ${cards.length}` : ''}` : note}</p>
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  );
}
