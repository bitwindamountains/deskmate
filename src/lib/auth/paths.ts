export const PUBLIC_PATHS: readonly string[] = ['/', '/login', '/auth/callback', '/manifest.webmanifest'];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/_next/');
}

// Same-origin relative path only: one leading "/", not followed by "/" or "\".
export function safeNext(next: string | null | undefined): string {
  return typeof next === 'string' && /^\/(?![/\\])[^\x00-\x1f\x7f]*$/.test(next) ? next : '/today';
}
