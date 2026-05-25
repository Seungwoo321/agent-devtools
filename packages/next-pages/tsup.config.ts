import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/bootstrap.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  platform: 'browser',
  splitting: false,
  treeshake: true,
  // Preserve `process.env.NODE_ENV` as a literal token so the host bundler
  // (Next's webpack DefinePlugin) can substitute it and DCE the production
  // early-return in bootstrap.ts. esbuild defaults to inlining NODE_ENV at
  // build time, which would strip the early-return here and leak the
  // mountAgentDevtools / createDefaultTransport call-site identifiers into
  // the host's production client chunks (regression-checked by
  // examples/next-pages/scripts/check-no-leak.mjs).
  define: {
    'process.env.NODE_ENV': 'process.env.NODE_ENV',
  },
});
