export const PUBLIC_PATHS: readonly string[] = ['/', '/login', '/auth/callback', '/manifest.webmanifest', '/sw.js'];

export function isPublicPath(pathname: string): boolean {
  // /api/* route handlers answer 401 JSON themselves; a login redirect would hand fetch callers an HTML page.
  return PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/_next/') || pathname.startsWith('/api/');
}

// Same-origin relative path only: one leading "/", not followed by "/" or "\".
export function safeNext(next: string | null | undefined): string {
  return typeof next === 'string' && /^\/(?![/\\])[^\x00-\x1f\x7f]*$/.test(next) ? next : '/today';
}
