/**
 * Regression guard for the bootstrap import contract.
 *
 * The vite plugin's injected bootstrap (`packages/vite/src/plugin.ts`)
 * generates a single `import { mountAgentDevtools, createDefaultTransport,
 * createAgentInfoFetcher, createHandoffRequester, createSettingsStore }`
 * statement against whichever framework adapter the host project resolves
 * to. If any adapter stops re-exporting one of those names the bootstrap
 * throws `does not provide an export named '…'` at first widget mount —
 * a runtime regression that the production no-leak check cannot catch
 * because it only audits production bundles.
 *
 * This test imports each adapter the way the bootstrap would and asserts
 * every required symbol is a defined export. Adding a new adapter? Append
 * it to ADAPTERS below.
 */
import { describe, expect, it } from 'vitest';

const BOOTSTRAP_SYMBOLS = [
  'mountAgentDevtools',
  'createDefaultTransport',
  'createAgentInfoFetcher',
  'createHandoffRequester',
  'createRelatedImportsFetcher',
  'createSourceSliceFetcher',
  'createPageContextEnricher',
  'createSettingsStore',
] as const;

const ADAPTERS = [
  '@agent-devtools/react',
  '@agent-devtools/vue',
  '@agent-devtools/vue2',
  '@agent-devtools/next',
  '@agent-devtools/next-pages',
  '@agent-devtools/nuxt',
  '@agent-devtools/nuxt2',
  '@agent-devtools/angular',
  '@agent-devtools/svelte',
  '@agent-devtools/sveltekit',
] as const;

describe('bootstrap import contract', () => {
  for (const spec of ADAPTERS) {
    it(`${spec} exposes every symbol the bootstrap imports`, async () => {
      const mod = (await import(spec)) as Record<string, unknown>;
      for (const sym of BOOTSTRAP_SYMBOLS) {
        expect(typeof mod[sym], `${spec} must export ${sym}`).toBe('function');
      }
    });
  }
});
