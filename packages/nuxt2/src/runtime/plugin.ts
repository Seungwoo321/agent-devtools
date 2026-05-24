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
 */
import { mountAgentDevtoolsVue2 } from '@agent-devtools/vue2';

export default function agentDevtoolsNuxt2Plugin(): void {
  if (typeof document === 'undefined') return;
  mountAgentDevtoolsVue2();
}
