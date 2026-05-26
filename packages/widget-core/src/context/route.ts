import type { RouteInfo } from './types.js';

/**
 * Adapter-injected resolver that returns the workspace-relative source
 * file for the current route, given the `pathname`. Adapters call back
 * into their own router (Next `router.pathname` → `pages${pathname}.tsx`,
 * Nuxt `useRoute().matched[0]`) and return the file path. Returning
 * `undefined` means "I cannot resolve this" — the field stays unset
 * rather than carrying a bad guess.
 */
export type RouteFileResolver = (pathname: string) => string | undefined;

/**
 * Pluck the parts of `window.location` we care about. We don't include the
 * full URL here — the caller can copy `location.href` if they want it; the
 * route object stays focused on the parts a router actually uses, so the
 * agent prompt can reason about "the user is on /settings/profile?x=1".
 */
export function extractRoute(
  location: Location | undefined,
  resolveRouteFile?: RouteFileResolver,
): RouteInfo {
  if (!location) {
    return { pathname: '', search: '', hash: '' };
  }
  const pathname = typeof location.pathname === 'string' ? location.pathname : '';
  const route: RouteInfo = {
    pathname,
    search: typeof location.search === 'string' ? location.search : '',
    hash: typeof location.hash === 'string' ? location.hash : '',
  };
  if (resolveRouteFile) {
    const resolved = resolveRouteFile(pathname);
    if (resolved) route.routeFile = resolved;
  }
  return route;
}
