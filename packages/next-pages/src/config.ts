/**
 * `next.config.{js,mjs,ts}` wrapper for Pages Router hosts. Two
 * responsibilities mirror the @agent-devtools/next adapter:
 *
 *   1. (Dev) Inject AGENT_DEVTOOLS_NEXT_PAGES_* env entries so the
 *      client-side bootstrap module knows the base URL and pairing
 *      token without the caller having to import them through a
 *      separate file.
 *
 *   2. (Prod) Install a webpack alias that maps the widget chain to
 *      `false` (empty module). This is Layer 1 of the dev-only guard:
 *      a user-side `_app.tsx` that does
 *      `import { bootstrapAgentDevtools } from '@agent-devtools/next-pages/bootstrap'`
 *      would otherwise drag the entire React-adapter widget UI into the
 *      production bundle, because the static import survives tree-shaking
 *      even though the runtime `bootstrapAgentDevtools()` body early-returns
 *      via `NODE_ENV === 'production'`. With the alias in place, webpack
 *      resolves the imports to empty modules and emits zero widget bytes.
 *
 *      `next build` runs webpack for Pages Router projects. The Layer 2
 *      runtime guard (mount entry throws when NODE_ENV === 'production')
 *      catches any leak as a thrown error.
 */

export interface WithAgentDevtoolsOptions {
  /**
   * Disable injection at runtime without removing the wrapper. The
   * bootstrap module skips mounting when this is `false`. The webpack
   * alias still runs in production so the widget code stays out of the
   * bundle either way.
   */
  enabled?: boolean;
  /**
   * Optional pairing-token + base URL override. When the dev server is
   * spawned outside the wrapper (external @agent-devtools/core process)
   * the bootstrap module needs these values to wire the transport.
   */
  baseUrl?: string;
  pairingToken?: string;
}

type WebpackContext = {
  dev: boolean;
  isServer: boolean;
};

type AliasMap = Record<string, string | false | string[]>;

type ResolveLike = {
  alias?: AliasMap;
};

type WebpackConfigLike = {
  resolve?: ResolveLike;
};

type WebpackFn = (config: WebpackConfigLike, ctx: WebpackContext) => WebpackConfigLike;

type NextConfigLike = Record<string, unknown>;

const ENABLED_ENV = 'AGENT_DEVTOOLS_NEXT_PAGES_ENABLED';
const BASE_URL_ENV = 'AGENT_DEVTOOLS_NEXT_PAGES_BASE_URL';
const PAIRING_TOKEN_ENV = 'AGENT_DEVTOOLS_NEXT_PAGES_PAIRING_TOKEN';

// Aliased to `false` (empty module) in production webpack builds. The
// bootstrap shim itself stays in the graph because its body early-returns
// on `NODE_ENV === 'production'` — replacing it with an empty module would
// turn the user-side `bootstrapAgentDevtools()` call into `undefined()` at
// runtime. Stripping the heavy chain below (React adapter, core, harness)
// keeps widget bytes out of the bundle while letting the runtime no-op
// stand.
const STRIPPED_MODULES = [
  '@agent-devtools/react',
  '@agent-devtools/core',
  '@agent-devtools/harness-core',
];

export function withAgentDevtools<TConfig extends NextConfigLike>(
  nextConfig: TConfig,
  options: WithAgentDevtoolsOptions = {},
): TConfig {
  const previousWebpack = nextConfig.webpack;
  const webpack: WebpackFn = (config, ctx) => {
    const next =
      typeof previousWebpack === 'function' ? (previousWebpack as WebpackFn)(config, ctx) : config;
    if (!ctx.dev) {
      next.resolve = next.resolve ?? {};
      next.resolve.alias = next.resolve.alias ?? {};
      const alias = next.resolve.alias as AliasMap;
      for (const mod of STRIPPED_MODULES) {
        alias[mod] = false;
      }
    }
    return next;
  };

  if (isProductionBuild() || options.enabled === false) {
    return { ...nextConfig, webpack };
  }

  const env = collectEnv(nextConfig);
  env[ENABLED_ENV] = 'true';
  if (options.baseUrl) env[BASE_URL_ENV] = options.baseUrl;
  if (options.pairingToken) env[PAIRING_TOKEN_ENV] = options.pairingToken;

  return { ...nextConfig, env, webpack };
}

function collectEnv(config: NextConfigLike): Record<string, string> {
  const existing = config.env;
  if (existing && typeof existing === 'object') {
    const copy: Record<string, string> = {};
    for (const [key, value] of Object.entries(existing as Record<string, unknown>)) {
      if (typeof value === 'string') copy[key] = value;
    }
    return copy;
  }
  return {};
}

function isProductionBuild(): boolean {
  const proc =
    typeof globalThis !== 'undefined'
      ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      : undefined;
  return proc?.env?.NODE_ENV === 'production';
}
