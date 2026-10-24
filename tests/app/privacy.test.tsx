import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { isPublicPath } from '@/lib/auth/paths';
import PrivacyPage from '@/app/privacy/page';

afterEach(cleanup);

test('the privacy notice is public, so it can be read before signing in', () => {
  expect(isPublicPath('/privacy')).toBe(true);
});

test('it names every service that receives student text, what stays, and how to export or delete', () => {
  render(<PrivacyPage />);
  expect(screen.getByRole('heading', { level: 1, name: 'Privacy notice' })).toBeTruthy();
  const text = document.body.textContent!;
  for (const s of ['Groq', 'LanguageTool', 'Supabase', 'Vercel', 'does not train', 'until you delete it', 'Download my data', 'Delete my data', '18']) {
    expect(text).toContain(s);
  }
  expect(screen.getByRole('link', { name: 'Back to Scholar' }).getAttribute('href')).toBe('/');
});
