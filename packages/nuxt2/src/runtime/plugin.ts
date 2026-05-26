/**
 * Client-only Nuxt 2 plugin. Registered by the module's setup when
 * `nuxt.options.dev` is true; the production build path never imports
 * this file, so the static import of `@agent-devtools/vue2` below is
 * exclusively a dev-time dependency.
 *
 * Runtime guard (Layer 2): even if a misconfiguration drags this file
 * into a production bundle, `mountAgentDevtoolsVue2` throws when
 * `NODE_ENV === 'production'`. The wrapper here also short-circuits the
 * mount when it cannot detect a browser document — covers Nuxt SSR runs
 * and the narrow window between hydration and the first `mounted` hook.
 *
 * Nuxt 2 plugins are functions invoked with `(context, inject)`. We
 * ignore both arguments: the widget mount is side-effect-only and does
 * not need access to the SSR context or the Vue 2 instance, because the
 * `@agent-devtools/vue2` walker locates components by traversing
 * `__vue__` DOM bridges instead of by reading a Vuex/Pinia container.
 *
 * The plugin also installs a default `resolveRouteFile` that maps the
 * current `window.location.pathname` onto a `pages/**.vue` candidate
 * path. The runtime cannot stat the filesystem, so this is a best-effort
 * heuristic — the host's `pages/` directory layout determines the real
 * path, and dynamic segments stay as-is. The agent can still grep
 * `pages/**` to find the actual route file when the heuristic misses.
 */
import { mountAgentDevtoolsVue2 } from '@agent-devtools/vue2';

/**
 * Map `window.location.pathname` onto a candidate `pages/**.vue` route
 * file. Nuxt 2's file-based router materialises every `pages/*.vue` into
 * a route whose URL mirrors the directory layout, so `/about` maps to
 * `pages/about.vue` and `/` maps to `pages/index.vue`.
 *
 * Dynamic segments (`pages/_slug.vue` → `/something`) cannot be
 * recovered from the rendered URL alone — the underscore convention is
 * directory-side metadata. We emit the materialised path; the agent can
 * grep `pages/**` when the file is parameterised.
 */
export function resolveNuxt2RouteFile(pathname: string): string | undefined {
  if (typeof pathname !== 'string') return undefined;
  if (pathname.length === 0 || pathname === '/') return 'pages/index.vue';
  const trimmed = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (trimmed.length === 0) return 'pages/index.vue';
  return `pages${trimmed}.vue`;
}

export default function agentDevtoolsNuxt2Plugin(): void {
  if (typeof document === 'undefined') return;
  mountAgentDevtoolsVue2({
    resolveRouteFile: resolveNuxt2RouteFile,
  });
}
