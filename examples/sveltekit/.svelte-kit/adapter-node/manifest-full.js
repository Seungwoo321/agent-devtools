export const manifest = (() => {
  function __memo(fn) {
    let value;
    return () => (value ??= value = fn());
  }

  return {
    appDir: '_app',
    appPath: '_app',
    assets: new Set([]),
    mimeTypes: {},
    _: {
      client: {
        start: '_app/immutable/entry/start.W-9kjwB2.js',
        app: '_app/immutable/entry/app.aIaAJuC6.js',
        imports: [
          '_app/immutable/entry/start.W-9kjwB2.js',
          '_app/immutable/chunks/Bb-pn1ur.js',
          '_app/immutable/chunks/eYpR7Yn_.js',
          '_app/immutable/entry/app.aIaAJuC6.js',
          '_app/immutable/chunks/eYpR7Yn_.js',
          '_app/immutable/chunks/Dj6f-nJM.js',
          '_app/immutable/chunks/DEDqjojZ.js',
        ],
        stylesheets: [],
        fonts: [],
        uses_env_dynamic_public: false,
      },
      nodes: [
        __memo(() => import('./nodes/0.js')),
        __memo(() => import('./nodes/1.js')),
        __memo(() => import('./nodes/2.js')),
      ],
      remotes: {},
      routes: [
        {
          id: '/',
          pattern: /^\/$/,
          params: [],
          page: { layouts: [0], errors: [1], leaf: 2 },
          endpoint: null,
        },
      ],
      prerendered_routes: new Set([]),
      matchers: async () => {
        return {};
      },
      server_assets: {},
    },
  };
})();
