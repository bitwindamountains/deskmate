// Server-only origin for OAuth redirects. Never derive this from request headers.
export function siteUrl(): string | null {
  const url = process.env.SITE_URL;
  if (url) return url.replace(/\/+$/, '');
  return process.env.NODE_ENV === 'production' ? null : 'http://localhost:3000';
}
