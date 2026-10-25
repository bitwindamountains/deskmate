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
  await waitFor(() => screen.getByLabelText('Code from the email'));
});

test('error ties to the email and code inputs via aria-invalid/aria-describedby', async () => {
  sendEmailCode.mockResolvedValue({ step: 'email', error: 'Nope' });
  render(<LoginForm next="/today" />);
  expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBeNull();
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
  fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
  const alert = await waitFor(() => screen.getByRole('alert'));
  const email = screen.getByLabelText('Email');
  expect(email.getAttribute('aria-invalid')).toBe('true');
  expect(alert.id).toBeTruthy();
  expect(email.getAttribute('aria-describedby')).toBe(alert.id);
});

test('initial error also ties to the email input', () => {
  render(<LoginForm next="/today" initialError="Bad code" />);
  expect(screen.getByLabelText('Email').getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
});

test('after deleting their data the student sees a plain notice, not an error', () => {
  render(<LoginForm next="/today" notice="Your Scholar data was deleted." />);
  expect(screen.getByRole('status').textContent).toBe('Your Scholar data was deleted.');
  expect(screen.queryByRole('alert')).toBeNull();
});
