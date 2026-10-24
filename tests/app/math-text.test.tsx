import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { MathText, splitMath } from '@/components/math-text';

afterEach(cleanup);

test.each([
  ['no math', 'Mitochondria make ATP.', [{ text: 'Mitochondria make ATP.' }]],
  ['dollar amounts stay text', 'It costs $5 and $10 later.', [{ text: 'It costs $5 and $10 later.' }]],
  ['inline $…$', 'Area is $\\pi r^2$ here.', [{ text: 'Area is ' }, { math: '\\pi r^2', display: false }, { text: ' here.' }]],
  ['inline \\(…\\)', 'So \\(x^2\\) grows.', [{ text: 'So ' }, { math: 'x^2', display: false }, { text: ' grows.' }]],
  ['display $$…$$', '$$E = mc^2$$', [{ math: 'E = mc^2', display: true }]],
  ['display \\[…\\]', 'Then \\[a+b\\]', [{ text: 'Then ' }, { math: 'a+b', display: true }]],
  ['chemistry', 'Water is $H_2O$.', [{ text: 'Water is ' }, { math: 'H_2O', display: false }, { text: '.' }]],
])('splitMath: %s', (_, input, parts) => {
  expect(splitMath(input)).toEqual(parts);
});

test('plain text renders as text, without loading KaTeX', () => {
  const { container } = render(<MathText text="It costs $5 and $10." />);
  expect(container.textContent).toBe('It costs $5 and $10.');
  expect(container.querySelector('.katex')).toBeNull();
});

test('math renders with KaTeX, including MathML for screen readers', async () => {
  const { container } = render(<MathText text="Area is \(\pi r^2\)." />);
  await waitFor(() => expect(container.querySelector('.katex')).not.toBeNull());
  expect(container.querySelector('math')).not.toBeNull();
  expect(container.textContent).toContain('Area is');
});

test('broken TeX shows the source instead of failing', async () => {
  const { container } = render(<MathText text="Bad \(\frac{1}{\)" />);
  await waitFor(() => expect(container.querySelector('.katex, .katex-error')).not.toBeNull());
  expect(container.textContent).toContain('Bad');
});
