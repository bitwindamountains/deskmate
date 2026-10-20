import type { ChatRequest, ProviderConfig, ProviderOutcome } from '../types.js';
import { mapFetchError } from './openai-compatible.js';

/** Google Gemini generateContent endpoint. */
export async function callGemini(p: ProviderConfig, apiKey: string | null, req: ChatRequest): Promise<ProviderOutcome> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['x-goog-api-key'] = apiKey;
  try {
    const res = await fetch(`${p.baseUrl}/models/${p.model}:generateContent`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(req.timeoutMs),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.user }] }],
        generationConfig: { temperature: req.temperature, responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) return { ok: false, status: res.status, message: (await res.text()).slice(0, 200) };
    const body = await res.json();
    const parts: { text?: string }[] | undefined = body.candidates?.[0]?.content?.parts;
    // No candidates means the prompt was blocked (e.g. safety); treat as a provider error.
    if (!parts) return { ok: false, status: 200, message: JSON.stringify(body.promptFeedback ?? body).slice(0, 200) };
    return {
      ok: true,
      text: parts.map((x) => x.text ?? '').join(''),
      tokensIn: body.usageMetadata?.promptTokenCount ?? 0,
      tokensOut: body.usageMetadata?.candidatesTokenCount ?? 0,
    };
  } catch (e) {
    return mapFetchError(e);
  }
}
