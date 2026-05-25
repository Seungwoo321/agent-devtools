<script lang="ts">
  import { onMount } from 'svelte';

  let { children } = $props();

  onMount(async () => {
    // Vite statically replaces `import.meta.env.PROD` with `true` or `false`
    // at compile time, so Rollup tree-shakes the dynamic import call site
    // out of the production client bundle (Layer 1 dev-only guard). The
    // mount entry's runtime NODE_ENV check is the Layer 2 backstop.
    if (import.meta.env.PROD) return;
    const { mountAgentDevtoolsSvelteKit } = await import('@agent-devtools/sveltekit');
    mountAgentDevtoolsSvelteKit();
  });
</script>

{@render children()}
