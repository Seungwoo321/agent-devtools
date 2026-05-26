/**
 * Resolve the workspace-relative source path for the current Next.js App
 * Router route from `window.location.pathname`. App Router maps URL
 * segments onto `app/**` directories whose leaf is `page.tsx` (or
 * `page.jsx` / `page.ts` / `page.js`). The runtime cannot stat the
 * filesystem to know which extension the host actually used, so this
 * helper emits the most common one (`.tsx`) — the agent can grep
 * `app${pathname}/page.*` if the extension turns out to be different.
 *
 * Conventions handled:
 *   - `/` → `app/page.tsx`
 *   - `/about` → `app/about/page.tsx`
 *   - `/blog/hello` → `app/blog/hello/page.tsx`
 *   - trailing slash trimmed
 *   - dynamic segments stay as-is (`/posts/123` → `app/posts/123/page.tsx`);
 *     the agent can grep `app/posts/**` if the route is parameterised.
 *
 * Returns `undefined` when `pathname` is missing or not a string — keeps
 * `route.routeFile` absent rather than emitting a guessed path that
 * would mislead the agent.
 */
export function resolveNextAppRouterRouteFile(pathname: string): string | undefined {
  if (typeof pathname !== 'string') return undefined;
  if (pathname.length === 0 || pathname === '/') return 'app/page.tsx';
  const trimmed = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (trimmed.length === 0) return 'app/page.tsx';
  // `pathname` always starts with `/` per WHATWG URL, so `app${trimmed}`
  // joins cleanly without an extra separator.
  return `app${trimmed}/page.tsx`;
}
