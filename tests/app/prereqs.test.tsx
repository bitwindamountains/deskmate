import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

const addPrereq = vi.fn();
const removePrereq = vi.fn();
vi.mock('@/app/(app)/study/deck/[deckId]/actions', () => ({
  addPrereq: (...a: unknown[]) => addPrereq(...a), removePrereq: (...a: unknown[]) => removePrereq(...a) }));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { Prereqs } from '@/app/(app)/study/deck/[deckId]/prereqs';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const D = '11111111-1111-4111-8111-111111111111';
const concepts = [{ key: 'cell respiration', label: 'Cell respiration' }, { key: 'glycolysis', label: 'Glycolysis' }];

test('adding an edge sends the two concept keys and refreshes', async () => {
  addPrereq.mockResolvedValue({ ok: true });
  render(<Prereqs deckId={D} concepts={concepts} edges={[]} />);
  fireEvent.change(screen.getByLabelText('This concept'), { target: { value: 'cell respiration' } });
  fireEvent.change(screen.getByLabelText('Builds on'), { target: { value: 'glycolysis' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(addPrereq).toHaveBeenCalledWith(D, 'cell respiration', 'glycolysis');
});

test('an edge can be removed, even when its concept no longer has cards', async () => {
  removePrereq.mockResolvedValue({ ok: true });
  render(<Prereqs deckId={D} concepts={concepts} edges={[{ concept: 'cell respiration', prereq: 'glycolysis' }, { concept: 'old topic', prereq: 'glycolysis' }]} />);
  expect(screen.getByText('Cell respiration builds on Glycolysis')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Remove old topic builds on Glycolysis' }));
  await vi.waitFor(() => expect(removePrereq).toHaveBeenCalledWith(D, 'old topic', 'glycolysis'));
});

test('a refused edge is an alert', async () => {
  addPrereq.mockResolvedValue({ ok: false, message: 'That would make a loop: glycolysis already builds on cell respiration.' });
  render(<Prereqs deckId={D} concepts={concepts} edges={[]} />);
  fireEvent.change(screen.getByLabelText('This concept'), { target: { value: 'cell respiration' } });
  fireEvent.change(screen.getByLabelText('Builds on'), { target: { value: 'glycolysis' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect((await screen.findByRole('alert')).textContent).toBe('That would make a loop: glycolysis already builds on cell respiration.');
});

test('adding and removing are announced, and choosing the same concept clears Builds on', async () => {
  addPrereq.mockResolvedValue({ ok: true });
  removePrereq.mockResolvedValue({ ok: true });
  render(<Prereqs deckId={D} concepts={concepts} edges={[{ concept: 'cell respiration', prereq: 'glycolysis' }]} />);
  fireEvent.change(screen.getByLabelText('Builds on'), { target: { value: 'glycolysis' } });
  fireEvent.change(screen.getByLabelText('This concept'), { target: { value: 'glycolysis' } });
  expect((screen.getByLabelText('Builds on') as HTMLSelectElement).value).toBe('');
  fireEvent.change(screen.getByLabelText('This concept'), { target: { value: 'cell respiration' } });
  fireEvent.change(screen.getByLabelText('Builds on'), { target: { value: 'glycolysis' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect((await screen.findByRole('status')).textContent).toBe('Added.');
  fireEvent.click(screen.getByRole('button', { name: 'Remove Cell respiration builds on Glycolysis' }));
  await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe('Removed.'));
});
