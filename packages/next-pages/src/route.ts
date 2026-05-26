/**
 * Resolve the workspace-relative source path of the current Pages Router
 * route. Reads `window.next.router.pathname`, which Next sets to the
 * *dynamic-segment* form (`/blog/[slug]`, not the materialised
 * `/blog/hello`). That is exactly the form that maps onto the project's
 * `pages/` directory layout.
 *
 * The file extension is deliberately omitted: Next Pages Router accepts
 * `.tsx`, `.jsx`, `.ts`, `.js`, `.mdx`, and `.md` for the same route, and
 * the runtime has no way to know which one the host actually used.
 * Emitting a guessed extension would point the agent at a nonexistent
 * file. The agent can grep `pages${pathname}.*` if it needs the source.
 *
 * Returns `undefined` when the Next runtime has not exposed its router
 * (very early in mount, or non-Next host).
 */
export function resolveNextPagesRouteFile(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const nextGlobal = (window as { next?: { router?: { pathname?: unknown } } }).next;
  const pathname = nextGlobal?.router?.pathname;
  if (typeof pathname !== 'string' || pathname.length === 0) return undefined;
  if (pathname === '/') return 'pages/index';
  return `pages${pathname}`;
}
