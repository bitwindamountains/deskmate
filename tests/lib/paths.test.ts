import { expect, test } from 'vitest';
import { isPublicPath, safeNext } from '@/lib/auth/paths';

test.each([['/today', '/today'], ['/study/deck/1?x=2', '/study/deck/1?x=2'], ['https://evil.example', '/today'],
  ['//evil.example', '/today'], ['/\\evil.example', '/today'], [null, '/today'], ['today', '/today']])
  ('safeNext(%s) = %s', (i, o) => expect(safeNext(i)).toBe(o));
test('isPublicPath', () => {
  expect(isPublicPath('/login')).toBe(true);
  expect(isPublicPath('/_next/static/a.js')).toBe(true);
  expect(isPublicPath('/today')).toBe(false);
});
