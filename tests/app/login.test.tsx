import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

const sendEmailCode = vi.fn();
vi.mock('@/app/login/actions', () => ({
  signInWithGoogle: vi.fn(),
  sendEmailCode: (...a: unknown[]) => sendEmailCode(...a),
  verifyEmailCode: vi.fn(),
}));

import { LoginForm } from '@/app/login/login-form';

afterEach(cleanup);

test('renders Google button and email field with a label', () => {
  render(<LoginForm next="/today" />);
  expect(screen.getByRole('heading', { name: 'Sign in to Scholar' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
  expect(screen.getByLabelText('Email')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Email me a code' })).toBeTruthy();
});

test('shows the rate-limit message when sendEmailCode returns it', async () => {
  sendEmailCode.mockResolvedValue({ step: 'email', error: 'Too many attempts. Wait a minute, then try again.' });
  render(<LoginForm next="/today" />);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
  fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
  const alert = await waitFor(() => screen.getByRole('alert'));
  expect(alert.textContent).toBe('Too many attempts. Wait a minute, then try again.');
});

test('moves to the code step with a labelled field', async () => {
  sendEmailCode.mockResolvedValue({ step: 'code', email: 'a@b.co' });
  render(<LoginForm next="/today" />);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
  fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
  await waitFor(() => screen.getByLabelText('6-digit code'));
});
