import { defineConfig } from 'tsup';

export default defineConfig({
  // `bootstrap/` is a tiny Node-friendly entry for bundler plugins (Vite,
  // Webpack, etc) — kept separate from the main browser entry so they can
  // import the early-trap builder without dragging the widget runtime into
  // their Node graph.
  entry: ['src/index.ts', 'src/bootstrap/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  platform: 'browser',
  splitting: false,
  treeshake: true,
});
