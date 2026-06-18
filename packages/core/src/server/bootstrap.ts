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
import {
  createApp,
  type AgentStreamFactory,
  type CommandLister,
  type PermissionMode,
  type ProviderId,
} from './app.js';
import { generatePairingToken } from './auth.js';
import { createWorkspace, type Workspace } from '../files/index.js';
import {
  createAcpCommandLister,
  createAcpProvider,
  createDefaultAcpRuntime,
  createDefaultAcpSessionStore,
  createSdkCommandLister,
  createSdkProvider,
} from '../providers/index.js';
import type { PermissionPolicy } from '../providers/acp.js';
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
  /**
   * Model-free command listers backing `GET /v1/agent/commands`, keyed by the
   * same `ProviderId` as `providers`. When omitted, the built-in `acp`/`sdk`
   * listers are registered alongside the built-in providers (skipped when a
   * custom `providers` map is supplied — the embedder then owns the runtime).
   */
  commandListers?: Partial<Record<ProviderId, CommandLister>>;
  /** Provider used when the request omits `provider`. Defaults to `'acp'`. */
  defaultProvider?: ProviderId;
  /** Permission mode used when the request omits `permissionMode`. Defaults to `'acceptEdits'`. */
  defaultPermissionMode?: PermissionMode;
  /**
   * Per-action permission policy used when the request omits `permissionPolicy`.
   * When unset, the provider's safe-by-default policy applies (file edits auto,
   * everything else ask).
   */
  defaultPermissionPolicy?: PermissionPolicy;
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
  // One shared persistent `(cwd, clientSessionId) → acpSessionId` store
  // backs both the ACP runtime (so a dev-server restart can resume a
  // tab's prior session) AND the terminal-handoff route (so the
  // browser-side modal can offer `claude --resume <id>` as a second
  // continuation option alongside `--append-system-prompt-file`). When
  // the embedder injects its own `providers` map we skip wiring our
  // default runtime — they own the lifecycle — but we still hand the
  // store to `createApp` so any provider that participates in the
  // mapping can light up the resume path.
  const acpSessionStore = createDefaultAcpSessionStore();
  // The built-in ACP provider and its command lister SHARE one runtime so the
  // lister reuses the pooled child + session rather than spawning a second
  // agent. When the embedder supplies its own `providers` map it owns the
  // runtime lifecycle, so we only register listers it explicitly passed.
  let providers: Partial<Record<ProviderId, AgentStreamFactory>>;
  let commandListers: Partial<Record<ProviderId, CommandLister>>;
  if (options.providers) {
    providers = options.providers;
    commandListers = options.commandListers ?? {};
  } else {
    const acpRuntime = createDefaultAcpRuntime({ sessionStore: acpSessionStore });
    providers = {
      acp: createAcpProvider({ runtime: acpRuntime }),
      sdk: createSdkProvider(),
    };
    commandListers = options.commandListers ?? {
      acp: createAcpCommandLister({ runtime: acpRuntime }),
      sdk: createSdkCommandLister(),
    };
  }
  const handler = createApp({
    pairingToken,
    workspace,
    providers,
    commandListers,
    acpSessionStore,
    ...(options.defaultProvider && { defaultProvider: options.defaultProvider }),
    ...(options.defaultPermissionMode && { defaultPermissionMode: options.defaultPermissionMode }),
    ...(options.defaultPermissionPolicy && {
      defaultPermissionPolicy: options.defaultPermissionPolicy,
    }),
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
