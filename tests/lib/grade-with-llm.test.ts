import { expect, test } from 'vitest';
import { answerHash } from '@/lib/grade/grade-with-llm';

test('answers differing only in case and punctuation share a hash', async () => {
  const a = await answerHash('card-1', 'The Mitochondria!');
  expect(a).toMatch(/^[0-9a-f]{64}$/);
  expect(await answerHash('card-1', '  mitochondria. ')).toBe(a);
});

test('the same answer on another card has a different hash', async () => {
  expect(await answerHash('card-2', 'mitochondria')).not.toBe(await answerHash('card-1', 'mitochondria'));
});

test('numbers keep their sign in the hash', async () => {
  expect(await answerHash('card-1', '-5')).not.toBe(await answerHash('card-1', '5'));
});
