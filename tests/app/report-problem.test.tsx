import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

const sendReport = vi.fn();
vi.mock('@/app/(app)/report-actions', () => ({ sendReport: (i: unknown) => sendReport(i) }));

import { ReportProblem } from '@/components/report-problem';

afterEach(() => { cleanup(); vi.resetAllMocks(); });
const ID = '00000000-0000-4000-8000-000000000001';

test('a card report sends the reason and note, then thanks the student', async () => {
  sendReport.mockResolvedValue(undefined);
  render(<ReportProblem target="card" targetId={ID} />);
  fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Choose what is wrong.');
  expect(sendReport).not.toHaveBeenCalled();

  fireEvent.click(screen.getByLabelText('My answer was graded wrong'));
  fireEvent.change(screen.getByLabelText('Anything to add? (optional)'), { target: { value: 'Synonym' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
  expect((await screen.findByRole('status')).textContent).toBe('Thanks. Reports like this help us fix Deskmate.');
  expect(sendReport).toHaveBeenCalledWith({ target: 'card', targetId: ID, reason: 'grading', note: 'Synonym' });
  expect(screen.queryByRole('button', { name: 'Report a problem' })).toBeNull();
});

test('feedback offers its own reasons, and a failed send keeps the form', async () => {
  sendReport.mockRejectedValue(new Error('x'));
  render(<ReportProblem target="feedback_item" targetId={ID} />);
  fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }));
  expect(screen.queryByLabelText('My answer was graded wrong')).toBeNull();
  fireEvent.click(screen.getByLabelText("It's unfair to how I write"));
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
  expect((await screen.findByRole('alert')).textContent).toBe("We couldn't send that report. Check your connection and try again.");
  expect(screen.getByRole('button', { name: 'Send report' })).toBeTruthy();
});

test('cancel closes the form and returns focus to the trigger', async () => {
  render(<ReportProblem target="card" targetId={ID} />);
  fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Report a problem' })));
});
