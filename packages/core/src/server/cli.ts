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
  createSdkCommandLister,
  createSdkProvider,
} from '../providers/index.js';
import type { PermissionPolicy } from '../providers/acp.js';
import { DEFAULT_PORT, PORT_FALLBACK_ATTEMPTS, startServer, type StartedServer } from './server.js';

export interface CliArgs {
  port: number;
  maxAttempts: number;
  workspace: string;
  help: boolean;
}

export interface CliResult {
  started?: StartedServer;
  exitCode: number;
  /** Fresh pairing token for this CLI process. Memory-only, never persisted. */
  pairingToken?: string;
  /** Resolved workspace root (canonical) the agent may read/edit within. */
  workspace?: Workspace;
}

export interface RunCliOptions {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  /**
   * Registered runtime providers (e.g. `'acp'`, `'sdk'`). If omitted or empty,
   * `/v1/agent/stream` responds 501. The widget picks one per request.
   */
  providers?: Partial<Record<ProviderId, AgentStreamFactory>>;
  /**
   * Model-free command listers backing `GET /v1/agent/commands`, keyed by the
   * same `ProviderId` as `providers`. When omitted, the built-in `acp`/`sdk`
   * listers are registered alongside the built-in providers (and skipped when
   * a custom `providers` map is supplied, since the embedder then owns the
   * runtime lifecycle the ACP lister would need to share).
   */
  commandListers?: Partial<Record<ProviderId, CommandLister>>;
  /** Provider used when the request omits `provider`. Defaults to `'acp'`. */
  defaultProvider?: ProviderId;
  /** Permission mode used when the request omits `permissionMode`. Defaults to `'acceptEdits'`. */
  defaultPermissionMode?: PermissionMode;
  /**
   * Per-action permission policy used when the request omits
   * `permissionPolicy`. When unset, the provider's safe-by-default policy
   * applies (file edits auto, everything else ask).
   */
  defaultPermissionPolicy?: PermissionPolicy;
}

const HELP = `agent-devtools — local dev agent server (127.0.0.1 only)

Usage:
  agent-devtools [--port <n>] [--max-attempts <n>] [--workspace <path>]

Options:
  --port <n>           Preferred port. Default ${String(DEFAULT_PORT)}.
                       If taken, the server tries port+1, port+2, ...
  --max-attempts <n>   Sequential ports to try before failing. Default ${String(PORT_FALLBACK_ATTEMPTS)}.
  --workspace <path>   Workspace root the agent may read/edit within.
                       Default: current working directory.
  --help, -h           Show this help.
`;

export function parseCliArgs(argv: readonly string[]): CliArgs {
  let port = DEFAULT_PORT;
  let maxAttempts = PORT_FALLBACK_ATTEMPTS;
  let workspace = process.cwd();
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--port') {
      port = readIntFlag(argv, i, 'port');
      i += 1;
      continue;
    }
    if (arg === '--max-attempts') {
      maxAttempts = readIntFlag(argv, i, 'max-attempts');
      i += 1;
      continue;
    }
    if (arg === '--workspace') {
      workspace = readStringFlag(argv, i, 'workspace');
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${String(arg)}`);
  }

  if (port < 0 || port > 65535) {
    throw new Error(`Invalid --port (must be 0..65535, 0 = OS-assigned): ${String(port)}`);
  }
  if (maxAttempts < 1) {
    throw new Error(`Invalid --max-attempts (must be >= 1): ${String(maxAttempts)}`);
  }

  return { port, maxAttempts, workspace, help };
}

function readIntFlag(argv: readonly string[], i: number, name: string): number {
  const raw = argv[i + 1];
  if (raw === undefined) throw new Error(`Missing value for --${name}`);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || String(parsed) !== raw) {
    throw new Error(`Invalid value for --${name}: ${raw}`);
  }
  return parsed;
}

function readStringFlag(argv: readonly string[], i: number, name: string): string {
  const raw = argv[i + 1];
  if (raw === undefined) throw new Error(`Missing value for --${name}`);
  return raw;
}

export async function runCli(
  argv: readonly string[],
  options: RunCliOptions = {},
): Promise<CliResult> {
  const stdout = options.stdout ?? ((line) => process.stdout.write(line));
  const stderr = options.stderr ?? ((line) => process.stderr.write(line));

  let args: CliArgs;
  try {
    args = parseCliArgs(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`${message}\n`);
    stderr(HELP);
    return { exitCode: 2 };
  }

  if (args.help) {
    stdout(HELP);
    return { exitCode: 0 };
  }

  let workspace: Workspace;
  try {
    workspace = createWorkspace(args.workspace);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`${message}\n`);
    return { exitCode: 2 };
  }

  const pairingToken = generatePairingToken();
  // When the caller doesn't pass an explicit providers map, register the
  // built-in defaults so the widget can talk to a working backend out of
  // the box. The ACP provider and its command lister SHARE one runtime so
  // the lister reuses the pooled child + session instead of spawning a
  // second agent.
  let providers: Partial<Record<ProviderId, AgentStreamFactory>>;
  let commandListers: Partial<Record<ProviderId, CommandLister>>;
  if (options.providers) {
    providers = options.providers;
    // The embedder owns the provider lifecycle; only register listers it
    // explicitly supplied (an ACP lister needs the embedder's runtime).
    commandListers = options.commandListers ?? {};
  } else {
    const acpRuntime = createDefaultAcpRuntime();
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
    ...(options.defaultProvider && { defaultProvider: options.defaultProvider }),
    ...(options.defaultPermissionMode && { defaultPermissionMode: options.defaultPermissionMode }),
    ...(options.defaultPermissionPolicy && {
      defaultPermissionPolicy: options.defaultPermissionPolicy,
    }),
  });
  const started = await startServer(handler, {
    port: args.port,
    maxAttempts: args.maxAttempts,
  });
  stdout(`agent-devtools listening on ${started.url}\n`);
  stdout(`workspace: ${workspace.root}\n`);
  stdout(`pairing token: ${pairingToken}\n`);
  return { started, exitCode: 0, pairingToken, workspace };
}
