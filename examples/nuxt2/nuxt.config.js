// Nuxt 2 example for the @agent-devtools/nuxt2 smoke. SSR is disabled
// (SPA mode) because Nuxt 2's server bundle requires its many runtime deps
// (e.g. `ufo`, `node-fetch-native`) to be resolvable from the host
// project's flat node_modules — an assumption that pre-dates pnpm's
// isolated installs. The widget injection path we are smoke-testing runs
// on the client only, so SPA mode exercises exactly the surface we care
// about without dragging in the SSR resolution shape.
module.exports = {
  ssr: false,
  target: 'static',
  server: {
    port: 3301,
    host: 'localhost',
  },
  modules: ['@agent-devtools/nuxt2'],
  build: {
    // Nuxt 2 ships webpack 4 + babel-loader and excludes node_modules from
    // transpilation by default. The widget chain pulls in `marked` (modern
    // syntax: nullish coalescing, optional chaining, class fields), which
    // webpack 4 cannot parse natively. Listing the workspace adapters and
    // their runtime deps here forces babel-loader to transform them.
    transpile: [
      '@agent-devtools/nuxt2',
      '@agent-devtools/vue2',
      '@agent-devtools/react',
      '@agent-devtools/core',
      'marked',
    ],
  },
};
