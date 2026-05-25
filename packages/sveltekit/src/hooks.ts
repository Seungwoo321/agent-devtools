/**
 * SvelteKit `handle` hook for agent-devtools.
 *
 * SvelteKit hosts wire this in `src/hooks.server.ts`:
 *
 * ```ts
 * import { createAgentDevtoolsHandle } from '@agent-devtools/sveltekit/hooks';
 *
 * export const handle = createAgentDevtoolsHandle();
 * ```
 *
 * The hook is a no-op in production: SvelteKit sets `dev` to `false` at the
 * `$app/environment` boundary, and the Vite plugin (`@agent-devtools/vite`)
 * uses `apply: 'serve'` so its server middleware never registers during
 * `vite build`. This hook is a defence-in-depth shim — if anyone wires it
 * into a custom Node adapter that bypasses Vite, the production env gate
 * still keeps the handler from running.
 *
 * Phase 0: identity passthrough. Future milestones wire the agent's pairing
 * token into the SvelteKit `event.locals` and emit the bootstrap config so
 * SSR pages pick up the widget on first paint.
 */

export interface SvelteKitHandleEvent {
  request: Request;
  url: URL;
}

export type SvelteKitResolver = (event: SvelteKitHandleEvent) => Promise<Response>;

export interface SvelteKitHandleInput {
  event: SvelteKitHandleEvent;
  resolve: SvelteKitResolver;
}

export type SvelteKitHandle = (input: SvelteKitHandleInput) => Promise<Response>;

export interface CreateAgentDevtoolsHandleOptions {
  /**
   * Override the production gate. Defaults to `process.env.NODE_ENV !== 'production'`.
   * Tests pass `enabled: true` to exercise the handler without env juggling.
   */
  enabled?: boolean;
}

export function createAgentDevtoolsHandle(
  options: CreateAgentDevtoolsHandleOptions = {},
): SvelteKitHandle {
  const enabled =
    options.enabled ?? (typeof process === 'undefined' || process?.env?.NODE_ENV !== 'production');

  if (!enabled) {
    return async ({ event, resolve }) => resolve(event);
  }

  return async ({ event, resolve }) => {
    return resolve(event);
  };
}
