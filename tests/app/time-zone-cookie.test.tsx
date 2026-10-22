import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { TimeZoneCookie } from '@/components/time-zone-cookie';

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
beforeEach(() => { document.cookie = 'tz=; max-age=0; path=/'; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test('stores the browser time zone in a cookie and refreshes once when the server had a different one', () => {
  render(<TimeZoneCookie serverZone="UTC-not-set" />);
  expect(document.cookie).toContain(`tz=${encodeURIComponent(zone)}`);
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('does nothing when the server already used this zone', () => {
  render(<TimeZoneCookie serverZone={zone} />);
  expect(refresh).not.toHaveBeenCalled();
});
