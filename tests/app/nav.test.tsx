import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Nav } from '@/components/nav';

afterEach(cleanup);

test('nav marks the current page and lists Today, Study, Write, Profile in order', () => {
  render(<Nav current="study" />);
  const nav = screen.getByRole('navigation', { name: 'Main' });
  const links = Array.from(nav.querySelectorAll('a'));
  expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
    ['Today', '/today'], ['Study', '/study'], ['Write', '/write'], ['Profile', '/profile'],
  ]);
  expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([null, 'page', null, null]);
});
