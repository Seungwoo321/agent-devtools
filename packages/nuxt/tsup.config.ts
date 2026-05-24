import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/runtime/plugin.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  // The module entry runs in Node (Nuxt build-time), the runtime plugin runs
  // in the browser. tsup emits one platform-neutral bundle per entry; we keep
  // the default `node` platform here because @nuxt/kit imports require it.
  platform: 'node',
  splitting: false,
  treeshake: true,
  external: ['@nuxt/kit', '@nuxt/schema', 'nuxt', 'vue'],
});
