import { expect, test } from 'vitest';
import { ProviderLimiter } from '../../src/llm/limiter.js';
import type { ProviderConfig } from '../../src/llm/types.js';

const p = (limits?: ProviderConfig['limits']): ProviderConfig =>
  ({ id: 'p', kind: 'openai', baseUrl: 'https://p/v1', model: 'm', apiKeyEnv: null, trainsOnInputs: false, limits });
const T = 1_000_000;

test('requests a minute: the next call waits until the oldest leaves the window', () => {
  const l = new ProviderLimiter();
  const q = p({ rpm: 2 });
  l.start(q, 10, T);
  l.start(q, 10, T + 1000);
  expect(l.check(q, 10, T + 2000)).toMatch(/2 requests a minute/);
  expect(l.check(q, 10, T + 60_001)).toBeNull();
});

test('tokens a minute count what calls really used; a lone call bigger than the limit still goes', () => {
  const l = new ProviderLimiter();
  const q = p({ rpm: 30, tpm: 1000 });
  expect(l.check(q, 5000, T)).toBeNull(); // nothing used yet: let the provider decide
  const done = l.start(q, 600, T);
  done(700);
  expect(l.check(q, 400, T + 1)).toMatch(/1000 tokens a minute/);
  expect(l.check(q, 200, T + 1)).toBeNull();
  expect(l.check(q, 400, T + 60_001)).toBeNull();
});

test('a 429 cools the provider down for Retry-After, or a minute without one', () => {
  const l = new ProviderLimiter();
  const q = p();
  l.cooldown(q, 30_000, T);
  expect(l.check(q, 0, T + 29_000)).toMatch(/cooling down/);
  expect(l.check(q, 0, T + 30_000)).toBeNull();
  l.cooldown(q, undefined, T);
  expect(l.check(q, 0, T + 59_000)).toMatch(/cooling down/);
  expect(l.check(q, 0, T + 60_000)).toBeNull();
});
