import { afterEach, expect, test, vi } from 'vitest';
import { callGemini } from '../../src/llm/providers/gemini.js';
import type { ProviderConfig } from '../../src/llm/types.js';

const p: ProviderConfig = { id: 'gemini', kind: 'gemini', baseUrl: 'https://g/v1beta', model: 'gm', apiKeyEnv: 'K', trainsOnInputs: true };
const req = { system: 'S', user: 'U', temperature: 0, timeoutMs: 1000 };

function stubFetch(impl: (...a: any[]) => Promise<Response>) {
  const f = vi.fn(impl);
  vi.stubGlobal('fetch', f);
  return f;
}
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

afterEach(() => vi.unstubAllGlobals());

test('posts generateContent with system instruction and JSON mime type', async () => {
  const f = stubFetch(() =>
    json({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4 } }),
  );
  const r = await callGemini(p, 'key', req);
  expect(r).toEqual({ ok: true, text: '{"a":1}', tokensIn: 3, tokensOut: 4 });
  const [url, init] = f.mock.calls[0];
  expect(url).toBe('https://g/v1beta/models/gm:generateContent');
  expect(init.headers['x-goog-api-key']).toBe('key');
  const body = JSON.parse(init.body);
  expect(body.systemInstruction.parts[0].text).toBe('S');
  expect(body.contents[0].parts[0].text).toBe('U');
  expect(body.generationConfig).toEqual({ temperature: 0, responseMimeType: 'application/json' });
});

test('maps 429 to {ok:false,status:429}', async () => {
  stubFetch(() => json({}, 429));
  expect(await callGemini(p, 'key', req)).toMatchObject({ ok: false, status: 429 });
});

test('response with no candidates (safety block) returns {ok:false,status:200}', async () => {
  stubFetch(() => json({ promptFeedback: { blockReason: 'SAFETY' } }));
  expect(await callGemini(p, 'key', req)).toMatchObject({ ok: false, status: 200 });
});

test('maps timeout to status "timeout"', async () => {
  stubFetch(() => Promise.reject(new DOMException('t', 'TimeoutError')));
  expect(await callGemini(p, 'key', req)).toMatchObject({ ok: false, status: 'timeout' });
});
