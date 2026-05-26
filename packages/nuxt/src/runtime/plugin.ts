/**
 * Client-only Nuxt plugin. Registered by `defineNuxtModule` setup when
 * `nuxt.options.dev` is true; the production build path never imports this
 * file, so the static import of `@agent-devtools/vue` below is exclusively
 * a dev-time dependency.
 *
 * Runtime guard (Layer 2): even if a misconfiguration drags this file into
 * a production bundle, `mountAgentDevtoolsVue` throws when
 * `NODE_ENV === 'production'`. The wrapper here also short-circuits the
 * mount when it cannot detect a browser document — covers SSR runs and the
 * narrow window between Nuxt hydration and `app:mounted`.
 *
 * The plugin also derives a `resolveRouteFile` from the host's Vue Router:
 * we read `nuxtApp.$router.currentRoute.value.matched[<leaf>]` and pull
 * `components.default.__file`, which @vitejs/plugin-vue injects into SFC
 * components at dev time. This lets the agent see the exact `pages/*.vue`
 * file that defined the current screen without grepping.
 */
import { mountAgentDevtoolsVue } from '@agent-devtools/vue';

interface VueComponentLike {
  readonly __file?: unknown;
}

interface RouteRecordLike {
  readonly components?: Readonly<Record<string, VueComponentLike | undefined>>;
}

interface VueRouteLike {
  readonly matched?: readonly RouteRecordLike[];
}

interface VueRouterLike {
  readonly currentRoute?: { readonly value?: VueRouteLike };
}

interface NuxtAppLike {
  readonly $router?: VueRouterLike;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DefineNuxtPlugin = (fn: (nuxtApp: any) => void | Promise<void>) => unknown;

declare const defineNuxtPlugin: DefineNuxtPlugin;

export function makeRouteFileResolver(nuxtApp: NuxtAppLike): () => string | undefined {
  return () => {
    const matched = nuxtApp.$router?.currentRoute?.value?.matched;
    if (!matched || matched.length === 0) return undefined;
    const leaf = matched[matched.length - 1];
    const file = leaf?.components?.default?.__file;
    return typeof file === 'string' && file.length > 0 ? file : undefined;
  };
}

export default defineNuxtPlugin((nuxtApp: NuxtAppLike) => {
  if (typeof document === 'undefined') return;
  mountAgentDevtoolsVue({
    resolveRouteFile: makeRouteFileResolver(nuxtApp),
  });
});
