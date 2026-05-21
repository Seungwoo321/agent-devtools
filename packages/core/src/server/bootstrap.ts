/**
 * Programmatic bootstrap for the agent-devtools server, used by host
 * integrations (the Vite plugin's `configureServer` hook is the first
 * caller). The CLI wrapper in `cli.ts` parses argv and reports to stdout;
 * this helper takes a typed options bag and stays silent so embedders can
 * own logging.
 *
 * It deliberately mirrors `runCli` so the two stay behaviorally aligned:
 *   1. Resolve + canonicalize the workspace root.
 *   2. Mint a fresh pairing token (memory-only, never persisted).
 *   3. Compose the app with the workspace + token + provider map.
 *   4. Listen on the requested port (with fallback), bound to loopback.
 */
import { createApp, type AgentStreamFactory, type PermissionMode, type ProviderId } from './app.js';
import { generatePairingToken } from './auth.js';
import { createWorkspace, type Workspace } from '../files/index.js';
import { createAcpProvider, createSdkProvider } from '../providers/index.js';
import { DEFAULT_PORT, PORT_FALLBACK_ATTEMPTS, startServer, type StartedServer } from './server.js';

export interface StartAgentDevtoolsServerOptions {
  /** Workspace root the agent may read/edit within. */
  workspace: string;
  /** Preferred port (with sequential fallback). Defaults to {@link DEFAULT_PORT}. */
  port?: number;
  /** How many ports to try before failing. Defaults to {@link PORT_FALLBACK_ATTEMPTS}. */
  maxAttempts?: number;
  /**
   * Registered runtime providers (e.g. `'acp'`, `'sdk'`). When omitted or empty,
   * `/v1/agent/stream` returns 501.
   */
  providers?: Partial<Record<ProviderId, AgentStreamFactory>>;
  /** Provider used when the request omits `provider`. Defaults to `'acp'`. */
  defaultProvider?: ProviderId;
  /** Permission mode used when the request omits `permissionMode`. Defaults to `'acceptEdits'`. */
  defaultPermissionMode?: PermissionMode;
}

export interface AgentDevtoolsServerHandle {
  /** `http://127.0.0.1:<port>` for the running server. */
  readonly url: string;
  /** Resolved bind port (may differ from the requested port if it was taken). */
  readonly port: number;
  /** Resolved canonical workspace root. */
  readonly workspace: Workspace;
  /** Fresh pairing token (memory-only). */
  readonly pairingToken: string;
  /** Stop the HTTP server. Resolves once the underlying socket is closed. */
  close(): Promise<void>;
  /** Raw started-server handle, exposed for advanced cases (introspection / tests). */
  readonly started: StartedServer;
}

export async function startAgentDevtoolsServer(
  options: StartAgentDevtoolsServerOptions,
): Promise<AgentDevtoolsServerHandle> {
  const workspace = createWorkspace(options.workspace);
  const pairingToken = generatePairingToken();
  // Match `runCli`: register built-in providers when the embedder didn't
  // supply its own.
  const providers: Partial<Record<ProviderId, AgentStreamFactory>> = options.providers ?? {
    acp: createAcpProvider(),
    sdk: createSdkProvider(),
  };
  const handler = createApp({
    pairingToken,
    workspace,
    providers,
    ...(options.defaultProvider && { defaultProvider: options.defaultProvider }),
    ...(options.defaultPermissionMode && { defaultPermissionMode: options.defaultPermissionMode }),
  });
  const started = await startServer(handler, {
    port: options.port ?? DEFAULT_PORT,
    maxAttempts: options.maxAttempts ?? PORT_FALLBACK_ATTEMPTS,
  });
  return {
    url: started.url,
    port: started.port,
    workspace,
    pairingToken,
    close: () => started.close(),
    started,
  };
}
