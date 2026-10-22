import Link from 'next/link';
import { essayPrompts, writeHref } from '@/growth/prompts';

/** Flashcards → essay (C1): short writing tasks from this deck, checked by Draft Coach like any essay. */
export function DeckPrompts({ deckTitle, cards }: { deckTitle: string; cards: { type: string; front: string; concept: string }[] }) {
  const prompts = essayPrompts(cards);
  if (!prompts.length) return null;
  return (
    <section aria-labelledby="deck-prompts-h" className="mb-8 max-w-prose space-y-3">
      <h2 id="deck-prompts-h" className="text-xl font-bold">Write about this deck</h2>
      <ul className="space-y-2 [overflow-wrap:anywhere]">
        {prompts.map((p) => <li key={p}><Link href={writeHref(deckTitle, p)} className="underline">{p}</Link></li>)}
      </ul>
    </section>
  );
}
