import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/hooks.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  platform: 'neutral',
  splitting: false,
  treeshake: true,
});
