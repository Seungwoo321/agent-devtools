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
 */
import { mountAgentDevtoolsVue } from '@agent-devtools/vue';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DefineNuxtPlugin = (fn: (nuxtApp: any) => void | Promise<void>) => unknown;

declare const defineNuxtPlugin: DefineNuxtPlugin;

export default defineNuxtPlugin(() => {
  if (typeof document === 'undefined') return;
  mountAgentDevtoolsVue();
});
