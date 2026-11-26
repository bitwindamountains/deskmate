import type { ProviderConfig } from './types';

const WINDOW_MS = 60_000;
const DEFAULT_COOLDOWN_MS = 60_000; // a 429 without Retry-After

/** Rough size of a call before it is sent: prompt characters / 4, doubled because output counts against the limit too. */
export const estimateTokens = (prompt: { system: string; user: string }) => Math.ceil((prompt.system.length + prompt.user.length) / 4) * 2;

/**
 * Keeps each provider under its free tier's per-minute limits (ProviderConfig.limits) and skips one that just answered 429,
 * so the router goes straight to the next provider instead of spending a request to be told no again.
 * State lives in this server instance's memory: on Vercel each instance counts on its own, so this is best effort and the
 * provider's own 429 is still the backstop.
 */
export class ProviderLimiter {
  private calls = new Map<string, { at: number; tokens: number }[]>();
  private coolUntil = new Map<string, number>();

  /** Why p can't take a call of about `tokens` tokens now, or null if it can. */
  check(p: ProviderConfig, tokens: number, now = Date.now()): string | null {
    const until = this.coolUntil.get(p.id) ?? 0;
    if (until > now) return `cooling down for ${Math.ceil((until - now) / 1000)} s after a 429`;
    if (!p.limits) return null;
    const recent = this.recent(p.id, now);
    if (recent.length >= p.limits.rpm) return `local limit: ${p.limits.rpm} requests a minute`;
    const used = recent.reduce((n, c) => n + c.tokens, 0);
    // A lone call bigger than the limit still goes: the provider decides, rather than it never being tried.
    if (p.limits.tpm && recent.length && used + tokens > p.limits.tpm) return `local limit: ${p.limits.tpm} tokens a minute`;
    return null;
  }

  /** Counts a call about to be sent; the returned function records the tokens it really used (0 keeps the estimate). */
  start(p: ProviderConfig, tokens: number, now = Date.now()): (actual: number) => void {
    const rec = { at: now, tokens };
    this.calls.set(p.id, [...this.recent(p.id, now), rec]);
    return (actual) => { if (actual > 0) rec.tokens = actual; };
  }

  cooldown(p: ProviderConfig, retryAfterMs: number | undefined, now = Date.now()) {
    this.coolUntil.set(p.id, now + (retryAfterMs ?? DEFAULT_COOLDOWN_MS));
  }

  reset() {
    this.calls.clear();
    this.coolUntil.clear();
  }

  private recent(id: string, now: number) {
    return (this.calls.get(id) ?? []).filter((c) => c.at > now - WINDOW_MS);
  }
}

export const providerLimiter = new ProviderLimiter();
