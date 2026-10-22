import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { DeckPrompts } from '@/app/(app)/study/deck/[deckId]/deck-prompts';
import { writeHref } from '@/growth/prompts';

afterEach(cleanup);

test('the deck page lists Write about this deck prompts and hides the section for an empty deck', () => {
  render(<DeckPrompts deckTitle="Biology" cards={[{ type: 'why', front: 'Why does ice float?', concept: 'density' }]} />);
  const section = screen.getByRole('region', { name: 'Write about this deck' });
  const link = within(section).getByRole('link', { name: 'Explain in one paragraph (at least 50 words): Why does ice float?' });
  expect(link.getAttribute('href')).toBe(writeHref('Biology', 'Explain in one paragraph (at least 50 words): Why does ice float?'));
  cleanup();
  const { container } = render(<DeckPrompts deckTitle="Empty" cards={[]} />);
  expect(container.innerHTML).toBe('');
});
