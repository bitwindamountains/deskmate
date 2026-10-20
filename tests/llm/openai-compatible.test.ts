import { afterEach, expect, test, vi } from 'vitest';
import { callOpenAICompatible } from '../../src/llm/providers/openai-compatible.js';
import type { ProviderConfig } from '../../src/llm/types.js';

const p: ProviderConfig = { id: 'groq', kind: 'openai', baseUrl: 'https://x/v1', model: 'm', apiKeyEnv: 'K', trainsOnInputs: false };
const req = { system: 'S', user: 'U', temperature: 0, timeoutMs: 1000 };

function stubFetch(impl: (...a: any[]) => Promise<Response>) {
  const f = vi.fn(impl);
  vi.stubGlobal('fetch', f);
  return f;
}
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

afterEach(() => vi.unstubAllGlobals());

test('posts chat completion and returns text + usage', async () => {
  const f = stubFetch(() => json({ choices: [{ message: { content: '{"a":1}' } }], usage: { prompt_tokens: 5, completion_tokens: 7 } }));
  const r = await callOpenAICompatible(p, 'key', req);
  expect(r).toEqual({ ok: true, text: '{"a":1}', tokensIn: 5, tokensOut: 7 });
  const [url, init] = f.mock.calls[0];
  expect(url).toBe('https://x/v1/chat/completions');
  expect(init.headers.Authorization).toBe('Bearer key');
  expect(JSON.parse(init.body)).toEqual({
    model: 'm',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }],
  });
});

test('omits Authorization when apiKey is null', async () => {
  const f = stubFetch(() => json({ choices: [{ message: { content: 'x' } }] }));
  await callOpenAICompatible(p, null, req);
  expect(f.mock.calls[0][1].headers.Authorization).toBeUndefined();
});

test('maps HTTP 429 to {ok:false,status:429}', async () => {
  stubFetch(() => json({ error: 'slow down' }, 429));
  const r = await callOpenAICompatible(p, 'key', req);
  expect(r).toMatchObject({ ok: false, status: 429 });
});

test('maps AbortError/TimeoutError to status "timeout"', async () => {
  stubFetch(() => Promise.reject(new DOMException('t', 'TimeoutError')));
  expect(await callOpenAICompatible(p, 'key', req)).toMatchObject({ ok: false, status: 'timeout' });
  stubFetch(() => Promise.reject(new DOMException('a', 'AbortError')));
  expect(await callOpenAICompatible(p, 'key', req)).toMatchObject({ ok: false, status: 'timeout' });
});

test('maps fetch TypeError to status "network"', async () => {
  stubFetch(() => Promise.reject(new TypeError('fetch failed')));
  expect(await callOpenAICompatible(p, 'key', req)).toMatchObject({ ok: false, status: 'network' });
});

test('missing usage gives tokensIn/tokensOut 0', async () => {
  stubFetch(() => json({ choices: [{ message: { content: 'x' } }] }));
  expect(await callOpenAICompatible(p, 'key', req)).toEqual({ ok: true, text: 'x', tokensIn: 0, tokensOut: 0 });
});
