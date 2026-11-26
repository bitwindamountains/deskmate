import { afterEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { AllProvidersFailedError, complete } from '../../src/llm/router.js';
import { providerLimiter } from '../../src/llm/limiter.js';
import type { ProviderConfig } from '../../src/llm/types.js';

const a: ProviderConfig = { id: 'a', kind: 'openai', baseUrl: 'https://a/v1', model: 'ma', apiKeyEnv: 'A_KEY', trainsOnInputs: false };
const b: ProviderConfig = { id: 'b', kind: 'openai', baseUrl: 'https://b/v1', model: 'mb', apiKeyEnv: 'B_KEY', trainsOnInputs: false };
const env = { A_KEY: 'ka', B_KEY: 'kb' };
const pr = { system: 'S', user: 'U' };
const s = z.object({ n: z.number() });

type Reply = { status?: number; content?: string; reject?: unknown; headers?: Record<string, string> };
/** Each provider host gets a queue of replies, consumed in order. */
function stubHosts(replies: Record<string, Reply[]>) {
  const f = vi.fn(async (url: string, _init?: RequestInit) => {
    const host = new URL(url).host;
    const r = replies[host].shift()!;
    if (r.reject) throw r.reject;
    return new Response(JSON.stringify({ choices: [{ message: { content: r.content ?? '' } }] }), { status: r.status ?? 200, headers: r.headers });
  });
  vi.stubGlobal('fetch', f);
  return f;
}
const statuses = (log: { status: string }[]) => log.map((l) => l.status);

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); providerLimiter.reset(); });

test('returns parsed data from first provider', async () => {
  stubHosts({ a: [{ content: '{"n":1}' }] });
  const r = await complete('grade_answer', pr, s, { env, providers: [a, b] });
  expect(r.data).toEqual({ n: 1 });
  expect(r.provider).toBe('a');
  expect(r.model).toBe('ma');
  expect(statuses(r.log)).toEqual(['ok']);
});

test('429 on a falls over to b', async () => {
  stubHosts({ a: [{ status: 429 }], b: [{ content: '{"n":2}' }] });
  const r = await complete('grade_answer', pr, s, { env, providers: [a, b] });
  expect(r.provider).toBe('b');
  expect(statuses(r.log)).toEqual(['rate_limited', 'ok']);
});

test('timeout on a falls over to b', async () => {
  stubHosts({ a: [{ reject: new DOMException('t', 'TimeoutError') }], b: [{ content: '{"n":2}' }] });
  const r = await complete('grade_answer', pr, s, { env, providers: [a, b] });
  expect(statuses(r.log)).toEqual(['timeout', 'ok']);
});

test('schema-invalid twice on a then b succeeds', async () => {
  stubHosts({ a: [{ content: 'nope' }, { content: '{"n":"x"}' }], b: [{ content: '{"n":3}' }] });
  const r = await complete('grade_answer', pr, s, { env, providers: [a, b] });
  expect(r.provider).toBe('b');
  expect(statuses(r.log)).toEqual(['schema_invalid', 'schema_invalid', 'ok']);
});

test('schema-invalid once then valid on retry stays on a', async () => {
  stubHosts({ a: [{ content: '{}' }, { content: '{"n":4}' }] });
  const r = await complete('grade_answer', pr, s, { env, providers: [a, b] });
  expect(r.provider).toBe('a');
  expect(statuses(r.log)).toEqual(['schema_invalid', 'ok']);
});

test('provider with unset key is skipped', async () => {
  const f = stubHosts({ b: [{ content: '{"n":5}' }] });
  const r = await complete('grade_answer', pr, s, { env: { B_KEY: 'kb' }, providers: [a, b] });
  expect(statuses(r.log)).toEqual(['skipped_no_key', 'ok']);
  expect(f.mock.calls.every(([u]) => !String(u).startsWith('https://a'))).toBe(true);
});

test('provider with null apiKeyEnv needs no key', async () => {
  stubHosts({ a: [{ content: '{"n":6}' }] });
  const r = await complete('grade_answer', pr, s, { env: {}, providers: [{ ...a, apiKeyEnv: null }] });
  expect(statuses(r.log)).toEqual(['ok']);
});

test('requireNoTraining skips trainsOnInputs providers', async () => {
  stubHosts({ b: [{ content: '{"n":7}' }] });
  const r = await complete('grade_answer', pr, s, { env, requireNoTraining: true, providers: [{ ...a, trainsOnInputs: true }, b] });
  expect(statuses(r.log)).toEqual(['skipped_privacy', 'ok']);
});

test('all fail throws AllProvidersFailedError with full log', async () => {
  stubHosts({ a: [{ status: 500 }], b: [{ status: 429 }] });
  const err = await complete('grade_answer', pr, s, { env, providers: [a, b] }).catch((e) => e);
  expect(err).toBeInstanceOf(AllProvidersFailedError);
  expect(statuses(err.log)).toEqual(['error', 'rate_limited']);
});

test('no usable provider: message names the missing env vars', async () => {
  await expect(complete('grade_answer', pr, s, { env: {}, providers: [a, b] })).rejects.toThrow(/A_KEY.*B_KEY/);
});

test('sends temperature 0', async () => {
  const f = stubHosts({ a: [{ content: '{"n":1}' }] });
  await complete('grade_answer', pr, s, { env, providers: [a] });
  expect(JSON.parse(f.mock.calls[0][1]!.body as string).temperature).toBe(0);
});

test('log entries carry task, provider, model', async () => {
  stubHosts({ a: [{ content: '{"n":1}' }] });
  const r = await complete('essay_global', pr, s, { env, providers: [a] });
  expect(r.log[0]).toMatchObject({ task: 'essay_global', provider: 'a', model: 'ma' });
});

test('failure message lists each provider and its reason', async () => {
  stubHosts({ b: [{ reject: new TypeError('fetch failed') }] });
  const err = await complete('grade_answer', pr, s, { env: { B_KEY: 'kb' }, providers: [a, b] }).catch((e) => e);
  expect(err.message).toMatch(/a: skipped_no_key \(A_KEY not set\)/);
  expect(err.message).toMatch(/b: error \(network: fetch failed\)/);
});

test('requireNoTraining defaults to true', async () => {
  stubHosts({ b: [{ content: '{"n":1}' }] });
  const r = await complete('grade_answer', pr, s, { env, providers: [{ ...a, trainsOnInputs: true }, b] });
  expect(statuses(r.log)).toEqual(['skipped_privacy', 'ok']);
});

test('after a 429, the provider is skipped without a call until its Retry-After passes', async () => {
  const f = stubHosts({ a: [{ status: 429, headers: { 'retry-after': '30' } }], b: [{ content: '{"n":1}' }, { content: '{"n":2}' }] });
  await complete('grade_answer', pr, s, { env, providers: [a, b] });
  const r = await complete('grade_answer', pr, s, { env, providers: [a, b] });
  expect(r.provider).toBe('b');
  expect(r.log[0]).toMatchObject({ provider: 'a', status: 'rate_limited' });
  expect(r.log[0].message).toMatch(/cooling down/);
  expect(f.mock.calls.filter(([url]) => new URL(url).host === 'a')).toHaveLength(1);
});

test('a provider at its requests-a-minute limit is skipped for the next one', async () => {
  const one = { ...a, limits: { rpm: 1 } };
  const f = stubHosts({ a: [{ content: '{"n":1}' }], b: [{ content: '{"n":2}' }] });
  expect((await complete('grade_answer', pr, s, { env, providers: [one, b] })).provider).toBe('a');
  const r = await complete('grade_answer', pr, s, { env, providers: [one, b] });
  expect(r.provider).toBe('b');
  expect(r.log[0].message).toMatch(/1 requests a minute/);
  expect(f).toHaveBeenCalledTimes(2);
});

test('demo mode never calls a provider, even with keys set', async () => {
  vi.stubEnv('DEMO_MODE', 'true');
  const f = stubHosts({ a: [{ content: '{"n":1}' }] });
  await expect(complete('grade_answer', pr, s, { env, providers: [a] })).rejects.toBeInstanceOf(AllProvidersFailedError);
  expect(f).not.toHaveBeenCalled();
});
