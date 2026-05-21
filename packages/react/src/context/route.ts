import type { RouteInfo } from './types.js';

/**
 * Pluck the parts of `window.location` we care about. We don't include the
 * full URL here — the caller can copy `location.href` if they want it; the
 * route object stays focused on the parts a router actually uses, so the
 * agent prompt can reason about "the user is on /settings/profile?x=1".
 */
export function extractRoute(location: Location | undefined): RouteInfo {
  if (!location) {
    return { pathname: '', search: '', hash: '' };
  }
  return {
    pathname: typeof location.pathname === 'string' ? location.pathname : '',
    search: typeof location.search === 'string' ? location.search : '',
    hash: typeof location.hash === 'string' ? location.hash : '',
  };
}
