import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const clearDeviceData = vi.fn();
vi.mock('@/review/client-sync', () => ({ clearDeviceData: () => clearDeviceData() }));
const deleteMyData = vi.fn();
vi.mock('@/app/(app)/profile/actions', () => ({ deleteMyData: (f: FormData) => deleteMyData(f) }));
const exportMyData = vi.fn();
vi.mock('@/lib/account/export', () => ({ exportMyData: () => exportMyData() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));

import { YourData } from '@/app/(app)/profile/your-data';

const click = vi.fn();
beforeEach(() => {
  clearDeviceData.mockResolvedValue(undefined);
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.resetAllMocks(); });

test('download saves everything as one JSON file', async () => {
  exportMyData.mockResolvedValue({ decks: [{ id: 'd1' }] });
  render(<YourData />);
  fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
  await waitFor(() => expect(click).toHaveBeenCalled());
  const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
  expect(JSON.parse(await blob.text())).toEqual({ decks: [{ id: 'd1' }] });
});

test('a failed download says so', async () => {
  exportMyData.mockResolvedValue(null);
  render(<YourData />);
  fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
  expect((await screen.findByRole('alert')).textContent).toBe("We couldn't gather your data. Try again in a minute.");
  expect(click).not.toHaveBeenCalled();
});

test('delete needs the word typed, and clears this device before deleting', async () => {
  deleteMyData.mockResolvedValue("We couldn't delete your data, and nothing was removed. Try again.");
  render(<YourData />);
  const box = screen.getByLabelText('Type delete to confirm');
  fireEvent.change(box, { target: { value: 'nope' } });
  fireEvent.click(screen.getByRole('button', { name: 'Delete my data' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Type delete to confirm.');
  expect(clearDeviceData).not.toHaveBeenCalled();

  fireEvent.change(box, { target: { value: 'delete' } });
  fireEvent.click(screen.getByRole('button', { name: 'Delete my data' }));
  await waitFor(() => expect(deleteMyData).toHaveBeenCalled());
  expect(clearDeviceData).toHaveBeenCalled();
  expect((await screen.findByRole('alert')).textContent).toBe("We couldn't delete your data, and nothing was removed. Try again.");
});
