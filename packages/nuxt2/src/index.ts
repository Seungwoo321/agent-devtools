/**
 * Nuxt 2 module entry. Nuxt 2 renders Vue 2 components, so the picker
 * walker, widget UI, and runtime mount are reused from
 * `@agent-devtools/vue2` verbatim — this module's only responsibility is
 * the build-time wiring (Layer 1 of the dev-only guard) that registers a
 * client-only Nuxt plugin to call `mountAgentDevtoolsVue2` on the first
 * client render.
 *
 *   - `nuxt.options.dev === false` → setup returns immediately. The
 *     `this.addPlugin` call is never made, so production builds see no
 *     agent-devtools imports in their dependency graph at all.
 *   - `nuxt.options.dev === true` → a client-only plugin is registered.
 *     The plugin file resolves to `./runtime/plugin.js`, which imports
 *     `mountAgentDevtoolsVue2` and mounts on the first client tick.
 *
 * Nuxt 2 modules are conventional functions invoked with `this` bound to
 * a `ModuleContainer`. Nuxt 2 does not have an `@nuxt/kit` equivalent, so
 * we duck-type the `addPlugin`/`options.dev` contract here and avoid
 * pulling `@nuxt/types` into the workspace just for the type alias.
 *
 * The module keeps no public options surface yet beyond the dev/prod
 * toggle: pairing token + base URL are sourced from the
 * `@agent-devtools/vite` plugin running in the same Nuxt 2 project (when
 * the host uses Vite via `nuxt-vite`/`@nuxt/vite-builder`) or from the
 * agent server's CLI invocation in the more common webpack flow.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

export interface AgentDevtoolsNuxt2ModuleOptions {
  /**
   * Disable injection at runtime without removing the module. Defaults to
   * `true`. The module still no-ops in production builds regardless of
   * this flag.
   */
  enabled?: boolean;
}

export interface Nuxt2ModuleContainer {
  options: { dev: boolean };
  addPlugin: (plugin: {
    src: string;
    mode?: 'client' | 'server' | 'all';
    fileName?: string;
  }) => void;
}

const here = dirname(fileURLToPath(import.meta.url));

export function setup(
  this: Nuxt2ModuleContainer | void,
  options: AgentDevtoolsNuxt2ModuleOptions,
  container?: Nuxt2ModuleContainer,
): void {
  const ctx = container ?? (this as Nuxt2ModuleContainer | undefined);
  if (!ctx) return;
  if (options.enabled === false) return;
  if (!ctx.options.dev) return;

  ctx.addPlugin({
    src: resolvePath(here, 'runtime/plugin.js'),
    mode: 'client',
    fileName: 'agent-devtools.client.js',
  });
}

interface Nuxt2ModuleExport {
  (this: Nuxt2ModuleContainer, options?: AgentDevtoolsNuxt2ModuleOptions): void;
  meta: { name: string };
}

const nuxt2Module: Nuxt2ModuleExport = function (
  this: Nuxt2ModuleContainer,
  options: AgentDevtoolsNuxt2ModuleOptions = {},
): void {
  setup.call(this, { enabled: true, ...options });
} as Nuxt2ModuleExport;
nuxt2Module.meta = { name: '@agent-devtools/nuxt2' };

export default nuxt2Module;

export type { MountAgentDevtoolsVue2Options } from '@agent-devtools/vue2';
export { resolveNuxt2RouteFile } from './runtime/plugin.js';
// Framework-uniform aliases. The vite plugin's injected bootstrap imports
// these names verbatim from whichever adapter package the host project
// resolves to, so every adapter must surface the same symbols. Nuxt 2
// reuses the Vue 2 mount wrapper unchanged.
export { mountAgentDevtoolsVue2 as mountAgentDevtools } from '@agent-devtools/vue2';
export {
  createDefaultTransport,
  createRelatedImportsFetcher,
  createSourceSliceFetcher,
  createPageContextEnricher,
  createAgentInfoFetcher,
  createHandoffRequester,
  createSettingsStore,
} from '@agent-devtools/widget-core';
