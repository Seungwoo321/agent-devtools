import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/runtime/plugin.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  // The module entry runs at Nuxt 2 build time in Node. The runtime plugin
  // runs in the browser but is shipped as a single platform-neutral ESM
  // bundle, like the Nuxt 3 adapter. We keep the default Node platform so
  // the path utilities in the module entry resolve correctly.
  platform: 'node',
  splitting: false,
  treeshake: true,
  external: ['nuxt', 'vue', '@agent-devtools/vue2'],
});
