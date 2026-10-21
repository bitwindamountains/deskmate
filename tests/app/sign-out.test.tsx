import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const unsyncedReviews = vi.fn();
const clearDeviceData = vi.fn();
vi.mock('@/review/client-sync', () => ({ unsyncedReviews: () => unsyncedReviews(), clearDeviceData: () => clearDeviceData() }));

import { SignOut } from '@/components/sign-out';

const submit = vi.fn();
beforeEach(() => {
  vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(submit);
  clearDeviceData.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.resetAllMocks(); });

test('signing out with everything synced clears the device, then posts the form', async () => {
  unsyncedReviews.mockResolvedValue(0);
  render(<SignOut />);
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(submit).toHaveBeenCalled());
  expect(clearDeviceData).toHaveBeenCalled();
});

test('unsynced reviews ask first, and cancelling keeps everything', async () => {
  unsyncedReviews.mockResolvedValue(2);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<SignOut />);
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy());
  expect(confirm.mock.calls[0][0]).toContain("2 reviews on this device couldn't be saved yet.");
  expect(clearDeviceData).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});
