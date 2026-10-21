import { expect, test, vi } from 'vitest';
import { checkSentences, LanguageToolUnavailable } from '@/lib/essay/languagetool';

const paras = ['Their going home now.', 'This paragraph is fine.', 'It is cold, we left early.'];
const match = (offset: number, length: number, category: string, message = 'Check this.', replacements: string[] = []) => ({
  message, offset, length, replacements: replacements.map((value) => ({ value })), rule: { id: 'R', category: { id: category, name: category } },
});
const respond = (matches: unknown[], status = 200) =>
  vi.fn(async () => new Response(JSON.stringify({ matches }), { status, headers: { 'content-type': 'application/json' } }));

test('checkSentences maps offsets back to the right paragraph', async () => {
  // P0 and P2 are sent, joined by a blank line: "Their going home now.\n\nIt is cold, we left early."
  const second = 'Their going home now.\n\n'.length + 'It is cold'.length;
  const fetchFn = respond([match(0, 5, 'CONFUSED_WORDS', 'Did you mean "They\'re"?', ['They\'re', 'There', 'Theirs', 'X']), match(second, 1, 'GRAMMAR')]);
  const items = await checkSentences(paras, [0, 2], fetchFn);
  expect(items).toEqual([
    { paragraph_index: 0, quote: 'Their', start: 0, end: 5, category: 'CONFUSED_WORDS', summary: 'Did you mean "They\'re"?', replacements: ['They\'re', 'There', 'Theirs'], convention: false },
    { paragraph_index: 2, quote: ',', start: 10, end: 11, category: 'GRAMMAR', summary: 'Check this.', replacements: [], convention: false },
  ]);
  const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://api.languagetool.org/v2/check');
  const body = new URLSearchParams(init.body as string);
  expect(body.get('language')).toBe('en-US');
  expect(body.get('text')).toBe('Their going home now.\n\nIt is cold, we left early.');
});

test('checkSentences drops STYLE matches and labels PUNCTUATION as convention', async () => {
  const items = await checkSentences(paras, [1], respond([match(0, 4, 'STYLE'), match(5, 9, 'PUNCTUATION'), match(15, 2, 'REDUNDANCY')]));
  expect(items.map((i) => [i.category, i.convention])).toEqual([['PUNCTUATION', true], ['REDUNDANCY', true]]);
});

test('checkSentences makes no request when there are no paragraphs to check', async () => {
  const fetchFn = respond([]);
  expect(await checkSentences(paras, [], fetchFn)).toEqual([]);
  expect(fetchFn).not.toHaveBeenCalled();
});

test('checkSentences throws LanguageToolUnavailable on 429', async () => {
  await expect(checkSentences(paras, [0], respond([], 429))).rejects.toBeInstanceOf(LanguageToolUnavailable);
  await expect(checkSentences(paras, [0], vi.fn(async () => { throw new TypeError('offline'); }))).rejects.toBeInstanceOf(LanguageToolUnavailable);
});
