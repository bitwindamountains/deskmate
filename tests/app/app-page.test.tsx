import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AppPage } from '@/components/page';

// WCAG 2.4.2: each screen names itself in the tab title, not just "Deskmate".
it('titles the document after the page heading', () => {
  render(<AppPage current="today" title="Review: Biology"><p>x</p></AppPage>);
  expect(document.title).toBe('Review: Biology · Deskmate');
});
