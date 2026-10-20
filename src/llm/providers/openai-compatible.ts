import type { ChatRequest, ProviderConfig, ProviderOutcome } from '../types.js';

export function mapFetchError(e: unknown): ProviderOutcome {
  const name = (e as { name?: string })?.name;
  const message = String((e as { message?: string })?.message ?? e);
  if (name === 'TimeoutError' || name === 'AbortError') return { ok: false, status: 'timeout', message };
  return { ok: false, status: 'network', message };
}

/** Groq, OpenRouter, Ollama and other OpenAI-compatible chat endpoints. */
export async function callOpenAICompatible(
  p: ProviderConfig,
  apiKey: string | null,
  req: ChatRequest,
): Promise<ProviderOutcome> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  try {
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(req.timeoutMs),
      body: JSON.stringify({
        model: p.model,
        temperature: req.temperature,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
      }),
    });
    if (!res.ok) return { ok: false, status: res.status, message: (await res.text()).slice(0, 200) };
    const body = await res.json();
    return {
      ok: true,
      text: body.choices?.[0]?.message?.content ?? '',
      tokensIn: body.usage?.prompt_tokens ?? 0,
      tokensOut: body.usage?.completion_tokens ?? 0,
    };
  } catch (e) {
    return mapFetchError(e);
  }
}
