import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  expect(screen.getByText("You've used today's 5 essay checks. They reset at midnight UTC.")).toBeTruthy();
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
