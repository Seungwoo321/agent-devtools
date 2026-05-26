/**
 * Nuxt 3 module entry. Nuxt renders Vue components, so the picker walker,
 * widget UI, and runtime mount are reused from `@agent-devtools/vue`
 * verbatim — this module's only responsibility is the build-time wiring
 * (Layer 1 of the dev-only guard) that registers a client-only Nuxt plugin
 * to call `mountAgentDevtoolsVue` on the first client render.
 *
 *   - `nuxt.options.dev === false` → setup returns immediately. `addPlugin`
 *     is never called, so production builds see no agent-devtools imports
 *     in their dependency graph at all.
 *   - `nuxt.options.dev === true` → a client-only plugin is registered. The
 *     plugin file resolves to `./runtime/plugin.js`, which imports
 *     `mountAgentDevtoolsVue` and calls it once `process.client` is true.
 *
 * The module deliberately keeps no public options surface yet beyond the
 * dev/prod toggle: pairing token + base URL are sourced from the
 * `@agent-devtools/vite` plugin running in the same Nuxt project (Nuxt 3
 * uses Vite by default and the Vite plugin's `framework: 'auto'` detection
 * picks `nuxt` from the host project's package.json).
 */
import { defineNuxtModule, addPlugin, createResolver } from '@nuxt/kit';

export interface AgentDevtoolsModuleOptions {
  /**
   * Disable injection at runtime without removing the module. Defaults to
   * `true`. The module still no-ops in production builds regardless of
   * this flag.
   */
  enabled?: boolean;
}

interface NuxtLike {
  options: { dev: boolean };
}

export function setup(options: AgentDevtoolsModuleOptions, nuxt: NuxtLike): void {
  if (!options.enabled) return;
  if (!nuxt.options.dev) return;

  const resolver = createResolver(import.meta.url);
  addPlugin({
    src: resolver.resolve('./runtime/plugin'),
    mode: 'client',
  });
}

interface NuxtModuleExport {
  (this: void, options: AgentDevtoolsModuleOptions, nuxt: NuxtLike): void;
  getMeta?: () => Promise<unknown>;
  setup: typeof setup;
}

const nuxtModule = defineNuxtModule<AgentDevtoolsModuleOptions>({
  meta: {
    name: '@agent-devtools/nuxt',
    configKey: 'agentDevtools',
    compatibility: { nuxt: '>=3.0.0' },
  },
  defaults: { enabled: true },
  setup,
}) as unknown as NuxtModuleExport;

export default nuxtModule;

export type { MountAgentDevtoolsVueOptions } from '@agent-devtools/vue';
// Framework-uniform aliases. The vite plugin's injected bootstrap imports
// these names verbatim from whichever adapter package the host project
// resolves to, so every adapter must surface the same symbols. Nuxt
// reuses the Vue mount wrapper unchanged — there is no Nuxt-specific
// `describePicked`; the Vue walker handles Nuxt-rendered components.
export { mountAgentDevtoolsVue as mountAgentDevtools } from '@agent-devtools/vue';
export {
  createDefaultTransport,
  createRelatedImportsFetcher,
  createSourceSliceFetcher,
  createPageContextEnricher,
  createAgentInfoFetcher,
  createHandoffRequester,
  createSettingsStore,
} from '@agent-devtools/widget-core';
