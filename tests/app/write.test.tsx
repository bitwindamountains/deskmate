import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

let rows: unknown[] = [];
vi.mock('@/lib/profile/require', () => ({ requireOnboardedUser: async () => ({ userId: 'u1', profile: {} }) }));
// a query chain whose builder methods return itself and which awaits to the current rows
const chain = (): unknown => new Proxy({}, { get: (_, k) => (k === 'then' ? (r: (v: unknown) => void) => r({ data: rows, error: null }) : chain) });
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: chain }) }));
const createEssay = vi.fn();
vi.mock('@/app/(app)/write/actions', () => ({ createEssay: (...a: unknown[]) => createEssay(...a) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import WritePage from '@/app/(app)/write/page';
import { EssayList } from '@/app/(app)/write/essays';
import { NewEssayForm } from '@/app/(app)/write/new/new-essay-form';

afterEach(() => { cleanup(); createEssay.mockReset(); rows = []; });

test('Write nav item is current on /write and the list shows status chips', async () => {
  rows = [
    { id: 'e1', title: 'Climate', drafts: [{ version: 1, layers: { global: 'done' } }] },
    { id: 'e2', title: 'Hamlet', drafts: [{ version: 1, layers: {} }] },
    { id: 'e3', title: 'Voting', drafts: [{ version: 1, layers: { global: 'done' } }, { version: 2, layers: {} }] },
  ];
  render(await WritePage());
  expect(screen.getByRole('link', { name: 'Write' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('link', { name: 'Write' }).getAttribute('href')).toBe('/write');
  const items = screen.getAllByRole('listitem').filter((li) => li.closest('main'));
  expect(items.map((li) => li.textContent)).toEqual(['ClimateFeedback ready', 'HamletWaiting for feedback', 'VotingRevising']);
  expect(screen.getByRole('link', { name: 'Climate' }).getAttribute('href')).toBe('/write/e1');
  expect(screen.getByRole('link', { name: 'New essay' }).getAttribute('href')).toBe('/write/new');
});

test('empty list shows No essays yet with a New essay link', async () => {
  render(await WritePage());
  expect(screen.getByRole('heading', { name: 'No essays yet' })).toBeTruthy();
  expect(screen.getByText('Paste a draft and get feedback that helps you revise it yourself.')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'New essay' }).getAttribute('href')).toBe('/write/new');
});

test('setup form shows the word-limit error before saving', () => {
  render(<NewEssayForm />);
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Climate' } });
  fireEvent.change(screen.getByLabelText('Your essay'), { target: { value: 'word '.repeat(2500) } });
  fireEvent.click(screen.getByRole('button', { name: 'Get feedback' }));
  expect(screen.getByRole('alert').textContent).toContain('This essay is 2,500 words.');
  expect(screen.getByLabelText('Your essay').getAttribute('aria-invalid')).toBe('true');
  expect(createEssay).not.toHaveBeenCalled();
});

test('a valid essay calls createEssay with the assignment details', () => {
  createEssay.mockResolvedValue({ ok: false, error: 'x' });
  render(<NewEssayForm />);
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: ' Climate ' } });
  fireEvent.change(screen.getByLabelText('Your essay'), { target: { value: 'word '.repeat(60) } });
  expect(screen.getByText('Assignment details (optional)').closest('details')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Essay type'), { target: { value: 'research' } });
  fireEvent.click(screen.getByRole('button', { name: 'Get feedback' }));
  expect(createEssay).toHaveBeenCalledWith({
    title: 'Climate', essayType: 'research', gradeLevel: 'college', assignmentPrompt: null, citationStyle: null, content: 'word '.repeat(60),
  });
});

test('a .txt upload is refused with the file-type message', async () => {
  render(<NewEssayForm />);
  const file = new File(['hello'], 'essay.txt', { type: 'text/plain' });
  fireEvent.change(screen.getByLabelText('Or upload a .pdf or .docx file'), { target: { files: [file] } });
  expect((await screen.findByRole('alert')).textContent).toContain('We can only read .pdf and .docx files.');
});

test('Write list shows essay checks left today', () => {
  const { rerender } = render(<EssayList essays={[{ id: 'e1', title: 'Climate', status: 'Feedback ready' }]} checksLeft={3} />);
  expect(screen.getByText('3 essay checks left today')).toBeTruthy();
  rerender(<EssayList essays={[]} checksLeft={1} />);
  expect(screen.getByText('1 essay check left today')).toBeTruthy();
  rerender(<EssayList essays={[]} checksLeft={0} />);
  expect(screen.getByText(/^You've used today's 5 essay checks\. They reset in (about \d+ hours?|under an hour)\.$/)).toBeTruthy();
});

test('rating it yourself first sends the scores and weakness; untouched criteria are left out', () => {
  createEssay.mockResolvedValue({ ok: false, error: 'x' });
  render(<NewEssayForm />);
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Climate' } });
  fireEvent.change(screen.getByLabelText('Your essay'), { target: { value: 'word '.repeat(60) } });
  expect(screen.getByText('Rate it yourself first (optional)').closest('details')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Thesis'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Evidence'), { target: { value: '2' } });
  expect(screen.getByLabelText('Thesis').querySelectorAll('option')).toHaveLength(5); // "Not rated" plus 1-4
  fireEvent.change(screen.getByLabelText("What's your essay's biggest weakness?"), { target: { value: 'Thin evidence.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Get feedback' }));
  expect(createEssay.mock.calls[0][0].selfAssessment).toEqual({
    scores: [{ criterion: 'Thesis', score: 3 }, { criterion: 'Evidence', score: 2 }], weakness: 'Thin evidence.',
  });
});

test('the new-essay form prefills title and prompt from the URL and opens assignment details', () => {
  render(<NewEssayForm initialTitle="Why does ice float?" initialPrompt="Explain in one paragraph (at least 50 words): Why does ice float?" />);
  expect((screen.getByLabelText('Title', { exact: true }) as HTMLInputElement).value).toBe('Why does ice float?');
  expect((screen.getByLabelText('Assignment prompt') as HTMLTextAreaElement).value).toContain('Why does ice float?');
  expect(screen.getByText('Assignment details (optional)').closest('details')!.open).toBe(true);
  expect((screen.getByLabelText('Essay type') as HTMLSelectElement).value).toBe('expository');
});

test('the timer counts down, announces at 5 and 1 minutes, and at zero shows Time\'s up without submitting', async () => {
  vi.useFakeTimers();
  try {
    createEssay.mockResolvedValue({ ok: false, error: 'x' });
    render(<NewEssayForm />);
    fireEvent.change(screen.getByLabelText('Timed practice'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start the timer' }));
    expect(screen.getAllByText('20 minutes left')).toHaveLength(2); // by the timer and next to Get feedback
    act(() => { vi.advanceTimersByTime(15 * 60_000); });
    expect(screen.getByRole('status', { name: 'Timer' }).textContent).toBe('5 minutes left');
    act(() => { vi.advanceTimersByTime(4 * 60_000); });
    expect(screen.getByRole('status', { name: 'Timer' }).textContent).toBe('1 minute left');
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByText("Time's up. Finish your sentence and get feedback.")).toBeTruthy();
    expect(createEssay).not.toHaveBeenCalled();
    const essay = screen.getByLabelText('Your essay', { exact: true }) as HTMLTextAreaElement;
    expect(essay.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Title', { exact: true }), { target: { value: 'Timed' } });
    fireEvent.change(essay, { target: { value: 'word '.repeat(60) } });
    fireEvent.click(screen.getByRole('button', { name: 'Get feedback' }));
    expect(createEssay.mock.calls[0][0]).toMatchObject({ timedMinutes: 20, minutesUsed: 20 });
  } finally {
    vi.useRealTimers();
  }
});

test('Stop the timer freezes the minutes used; a timer left running is capped at the limit plus 30', async () => {
  vi.useFakeTimers();
  try {
    createEssay.mockResolvedValue({ ok: false, error: 'x' });
    const fill = () => {
      fireEvent.change(screen.getByLabelText('Title', { exact: true }), { target: { value: 'Timed' } });
      fireEvent.change(screen.getByLabelText('Your essay', { exact: true }), { target: { value: 'word '.repeat(60) } });
    };
    render(<NewEssayForm />);
    fireEvent.change(screen.getByLabelText('Timed practice'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start the timer' }));
    act(() => { vi.advanceTimersByTime(7 * 60_000); });
    fireEvent.click(screen.getByRole('button', { name: 'Stop the timer' }));
    expect(screen.getByText('Stopped at 7 minutes')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(60 * 60_000); });
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Get feedback' }));
    expect(createEssay.mock.calls[0][0]).toMatchObject({ timedMinutes: 20, minutesUsed: 7 });
    cleanup();

    render(<NewEssayForm />);
    fireEvent.change(screen.getByLabelText('Timed practice'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start the timer' }));
    act(() => { vi.advanceTimersByTime(120 * 60_000); });
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Get feedback' }));
    expect(createEssay.mock.calls[1][0]).toMatchObject({ minutesUsed: 50 });
  } finally {
    vi.useRealTimers();
  }
});

test('stopping the timer is announced and keeps keyboard focus', () => {
  vi.useFakeTimers();
  try {
    render(<NewEssayForm />);
    fireEvent.change(screen.getByLabelText('Timed practice'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start the timer' }));
    act(() => { vi.advanceTimersByTime(3 * 60_000); });
    fireEvent.click(screen.getByRole('button', { name: 'Stop the timer' }));
    const stopped = screen.getByText('Stopped at 3 minutes');
    expect(stopped.getAttribute('role')).toBe('status');
    expect(document.activeElement).toBe(stopped);
  } finally {
    vi.useRealTimers();
  }
});

test('a stop can be undone: Resume keeps counting from the original start and returns focus to Stop', () => {
  vi.useFakeTimers();
  try {
    render(<NewEssayForm />);
    fireEvent.change(screen.getByLabelText('Timed practice'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start the timer' }));
    act(() => { vi.advanceTimersByTime(3 * 60_000); });
    fireEvent.click(screen.getByRole('button', { name: 'Stop the timer' }));
    act(() => { vi.advanceTimersByTime(2 * 60_000); });
    fireEvent.click(screen.getByRole('button', { name: 'Resume the timer' }));
    expect(screen.queryByText(/Stopped at/)).toBeNull();
    expect(screen.getAllByText('25 minutes left')).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Stop the timer' }));
  } finally {
    vi.useRealTimers();
  }
});
