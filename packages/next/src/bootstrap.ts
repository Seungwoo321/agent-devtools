/**
 * Client-side bootstrap for `@agent-devtools/next`. The host project
 * imports this once from a `app/agent-devtools.tsx` client component (App
 * Router) or `_app.tsx` (Pages Router) so the widget is mounted on the
 * first client render. Production builds short-circuit: the React adapter
 * already throws when NODE_ENV === 'production' (Layer 2 runtime guard),
 * and the env-flag check below adds a third, explicit refusal so callers
 * see a clean no-op rather than a thrown error.
 *
 * Why two-step (config + bootstrap) instead of automatic injection: the
 * App Router's RSC boundary makes blanket auto-injection unsafe — the
 * widget is a client-only feature and must not run on the server. The
 * bootstrap module is marked client-only by the caller's "use client"
 * directive, so the boundary stays explicit and the agent never sees a
 * mismatched server-render fingerprint.
 *
 * Layer 1 DCE shape: the `process.env.NODE_ENV === 'production'` literal
 * MUST be the very first statement so Next's webpack DefinePlugin can
 * inline it to `'production' === 'production'` and the minifier can prove
 * the rest of the function body unreachable in production builds. This
 * elides every call-site identifier (`mountAgentDevtools`,
 * `createDefaultTransport`, `createAgentCommandsFetcher`) from the emitted
 * client chunk. Don't refactor
 * this into a helper function — that opacity defeats DCE and re-leaks the
 * symbols regression-checked by examples/next/scripts/check-no-leak.mjs.
 */
import {
  mountAgentDevtools,
  createDefaultTransport,
  createAgentCommandsFetcher,
} from '@agent-devtools/react';
import { resolveNextAppRouterRouteFile } from './route.js';

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
    getAgentCommands: createAgentCommandsFetcher({ baseUrl, pairingToken }),
    resolveRouteFile: resolveNextAppRouterRouteFile,
  });
}

function readEnv(): { enabled?: string; baseUrl?: string; pairingToken?: string } {
  // Read each value as a LITERAL `process.env.<KEY>` expression so the bundler
  // substitutes it at compile time (Next's `env`-config inlining via webpack
  // DefinePlugin / Turbopack). The App Router client bundle has no runtime
  // `process` object, so a dynamic `globalThis.process.env[key]` lookup resolves
  // to undefined and the widget never mounts — literal member access is the only
  // form the bundler can statically replace. (Mirrors the `process.env.NODE_ENV`
  // literal already relied on in bootstrapAgentDevtools above.)
  const result: { enabled?: string; baseUrl?: string; pairingToken?: string } = {};
  if (process.env.AGENT_DEVTOOLS_NEXT_ENABLED)
    result.enabled = process.env.AGENT_DEVTOOLS_NEXT_ENABLED;
  if (process.env.AGENT_DEVTOOLS_NEXT_BASE_URL)
    result.baseUrl = process.env.AGENT_DEVTOOLS_NEXT_BASE_URL;
  if (process.env.AGENT_DEVTOOLS_NEXT_PAIRING_TOKEN)
    result.pairingToken = process.env.AGENT_DEVTOOLS_NEXT_PAIRING_TOKEN;
  return result;
}
