/**
 * SvelteKit adapter for agent-devtools.
 *
 * Re-exports the Svelte adapter's mount entry so SvelteKit hosts can call
 * `mountAgentDevtoolsSvelteKit()` from a dev-only `+layout.svelte` `onMount`
 * call. The mount entry shares Svelte 4/5 `__svelte_meta` walker + closed
 * shadow widget with `@agent-devtools/svelte` — SvelteKit just adds the
 * server-side `handle` hook (`./hooks`) and the route awareness scaffolding
 * for later milestones.
 *
 * Dev-only contract: the mount entry throws when `NODE_ENV === 'production'`.
 * The Vite plugin (`@agent-devtools/vite`) auto-detects SvelteKit hosts via
 * the `@sveltejs/kit` dep and resolves the bootstrap import to this package.
 */
export {
  mountAgentDevtoolsSvelte as mountAgentDevtoolsSvelteKit,
  describePickedSvelte as describePickedSvelteKit,
  walkComponentAncestors,
  readSvelteMeta,
  deriveComponentName,
  resolveSourceFromMeta,
  type MountAgentDevtoolsSvelteOptions as MountAgentDevtoolsSvelteKitOptions,
  type DescribePickedSvelteOptions as DescribePickedSvelteKitOptions,
  type SvelteComponentRef,
  type SvelteElementMeta,
  type SvelteSourceLocation,
} from '@agent-devtools/svelte';

// Framework-uniform aliases. The vite plugin bootstrap imports these names
// verbatim — sveltekit hosts ride the same contract as every other adapter.
export {
  mountAgentDevtoolsSvelte as mountAgentDevtools,
  createDefaultTransport,
  createRelatedImportsFetcher,
  createSourceSliceFetcher,
  createPageContextEnricher,
  createAgentInfoFetcher,
  createHandoffRequester,
  createSettingsStore,
} from '@agent-devtools/svelte';
