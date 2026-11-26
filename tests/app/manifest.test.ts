import { expect, test } from 'vitest';
import manifest from '../../src/app/manifest';

test('manifest starts at /today in standalone mode', () => {
  expect(manifest()).toMatchObject({ name: 'Deskmate', short_name: 'Deskmate', start_url: '/today', display: 'standalone' });
});
