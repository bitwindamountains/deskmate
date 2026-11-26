import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

const signIn = vi.fn();
const signUp = vi.fn();
const reset = vi.fn();
vi.mock('@/app/login/actions', () => ({
  signInWithGoogle: vi.fn(),
  signInWithPassword: (...a: unknown[]) => signIn(...a),
  signUpWithPassword: (...a: unknown[]) => signUp(...a),
  sendPasswordReset: (...a: unknown[]) => reset(...a),
}));

import { LoginForm } from '@/app/login/login-form';
import { SignInShell } from '@/app/login/sign-in-shell';

afterEach(cleanup);

const fill = (email: string, password?: string) => {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  if (password !== undefined) fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
};

test('sign-in shows Google, labelled email and password fields, and the other two forms', () => {
  render(<LoginForm next="/today" />);
  expect(screen.getByRole('heading', { name: 'Sign in to Deskmate' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
  expect(screen.getByLabelText('Email').getAttribute('autocomplete')).toBe('username');
  expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password');
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Create an account' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Forgot your password?' })).toBeTruthy();
});

test('the sign-in page says what Deskmate is, leads with one h1, and offers a card to try before the form', () => {
  render(<SignInShell><LoginForm next="/today" /></SignInShell>);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Study a little. Remember it for good.');
  expect(screen.getByText(/Deskmate helps you study without doing the work for you/)).toBeTruthy();
  expect(screen.getByText(/Free beta for students 18 and over/)).toBeTruthy();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  const fields = screen.getAllByRole('textbox');
  expect(fields.map((f) => f.id)).toEqual(['email', 'try-answer']); // the form comes first in reading and tab order
});

test('a failed sign-in ties the error to both fields', async () => {
  signIn.mockResolvedValue({ mode: 'signin', email: 'a@b.co', error: "That email and password don't match." });
  render(<LoginForm next="/today" />);
  fill('a@b.co', 'secret123');
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  const alert = await waitFor(() => screen.getByRole('alert'));
  expect(screen.getByLabelText('Email').getAttribute('aria-describedby')).toBe(alert.id);
  expect(screen.getByLabelText('Password').getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByLabelText('Password').getAttribute('aria-describedby')).toBe(alert.id);
});

test('creating an account asks for a new password and then says to check the email', async () => {
  signUp.mockResolvedValue({ mode: 'signup', email: 'a@b.co', sent: true });
  render(<LoginForm next="/today" />);
  fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
  expect(screen.getByRole('heading', { name: 'Create your account' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
  const pw = screen.getByLabelText('Password');
  expect(pw.getAttribute('autocomplete')).toBe('new-password');
  expect(pw.getAttribute('minlength')).toBe('8');
  expect(pw.getAttribute('aria-describedby')).toBe('password-hint');
  fill('a@b.co', 'long enough');
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/^Check your email: open the link we sent to a@b.co/));
  expect(signUp.mock.calls[0][1].get('mode')).toBe('signup');
});

test('forgot password sends a reset link without saying whether the account exists', async () => {
  reset.mockResolvedValue({ mode: 'forgot', email: 'a@b.co', sent: true });
  render(<LoginForm next="/today" />);
  fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }));
  expect(screen.queryByLabelText('Password')).toBeNull();
  fill('a@b.co');
  fireEvent.click(screen.getByRole('button', { name: 'Email me a reset link' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('If a@b.co has a Deskmate account, we sent it a link to set a new password.'));
  fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
  expect(screen.getByRole('heading', { name: 'Sign in to Deskmate' })).toBeTruthy();
});

test('initial error also ties to the email input', () => {
  render(<LoginForm next="/today" initialError="We couldn't finish signing you in." />);
  expect(screen.getByLabelText('Email').getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
});

test('after deleting their data the student sees a plain notice, not an error', () => {
  render(<LoginForm next="/today" notice="Your Deskmate data was deleted." />);
  expect(screen.getByRole('status').textContent).toBe('Your Deskmate data was deleted.');
  expect(screen.queryByRole('alert')).toBeNull();
});
