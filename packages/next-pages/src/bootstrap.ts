/**
 * Client-side bootstrap for `@agent-devtools/next-pages`. The host project
 * imports this once from `pages/_app.tsx` so the widget is mounted on the
 * first client render. Production builds short-circuit at three layers:
 *
 *   1. The Layer 1 webpack alias in withAgentDevtools maps the React
 *      adapter chain to false, so the static import resolves to an empty
 *      module and emits zero widget bytes.
 *   2. The `process.env.NODE_ENV === 'production'` literal below is
 *      DCE'd by Next's webpack DefinePlugin in production builds — the
 *      rest of this function body proves unreachable to the minifier.
 *   3. The mount entry's runtime guard throws if a leak ever reaches the
 *      production client.
 *
 * Layer 1 DCE shape: the `process.env.NODE_ENV === 'production'` literal
 * MUST be the very first statement so Next's webpack DefinePlugin can
 * inline it to `'production' === 'production'` and the minifier can prove
 * the rest of the function body unreachable in production builds. This
 * elides every call-site identifier (`mountAgentDevtools`,
 * `createDefaultTransport`) from the emitted client chunk. Don't refactor
 * this into a helper function — that opacity defeats DCE and re-leaks the
 * symbols regression-checked by examples/next-pages/scripts/check-no-leak.mjs.
 */
import { mountAgentDevtools, createDefaultTransport } from '@agent-devtools/react';
import { resolveNextPagesRouteFile } from './route.js';

export interface AgentDevtoolsBootstrapOptions {
  /** Override the base URL injected by withAgentDevtools (next.config). */
  baseUrl?: string;
  /** Override the pairing token injected by withAgentDevtools (next.config). */
  pairingToken?: string;
}

let mounted = false;

export function bootstrapAgentDevtools(options: AgentDevtoolsBootstrapOptions = {}): void {
  if (process.env.NODE_ENV === 'production') return;
  if (mounted) return;
  if (typeof window === 'undefined') return;

  const env = readEnv();
  if (env.enabled !== 'true') return;
  const baseUrl = options.baseUrl ?? env.baseUrl;
  const pairingToken = options.pairingToken ?? env.pairingToken;
  if (!baseUrl || !pairingToken) return;

  mounted = true;
  mountAgentDevtools({
    transport: createDefaultTransport({ baseUrl, pairingToken }),
    resolveRouteFile: resolveNextPagesRouteFile,
  });
}

function readEnv(): { enabled?: string; baseUrl?: string; pairingToken?: string } {
  const proc =
    typeof globalThis !== 'undefined'
      ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      : undefined;
  const env = proc?.env;
  if (!env) return {};
  const result: { enabled?: string; baseUrl?: string; pairingToken?: string } = {};
  if (env.AGENT_DEVTOOLS_NEXT_PAGES_ENABLED) result.enabled = env.AGENT_DEVTOOLS_NEXT_PAGES_ENABLED;
  if (env.AGENT_DEVTOOLS_NEXT_PAGES_BASE_URL)
    result.baseUrl = env.AGENT_DEVTOOLS_NEXT_PAGES_BASE_URL;
  if (env.AGENT_DEVTOOLS_NEXT_PAGES_PAIRING_TOKEN)
    result.pairingToken = env.AGENT_DEVTOOLS_NEXT_PAGES_PAIRING_TOKEN;
  return result;
}
