import { expect, test } from 'vitest';
import manifest from '../../src/app/manifest';

test('manifest starts at /today in standalone mode', () => {
  expect(manifest()).toMatchObject({ name: 'Scholar', start_url: '/today', display: 'standalone' });
});
