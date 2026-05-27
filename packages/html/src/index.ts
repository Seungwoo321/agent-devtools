/**
 * `@agent-devtools/html` — a tiny npx runner that serves a folder of plain
 * HTML through a programmatic Vite dev server with the agent-devtools
 * widget injected. It exists so a non-developer (e.g. a planner sketching
 * pages via Claude Code) can launch the floating widget on plain HTML with
 * a single command:
 *
 *     npx @agent-devtools/html ./my-pages
 *
 * Nothing here re-implements injection, transport, the pairing-token flow,
 * or the dev-only guard. It reuses the existing Vite plugin verbatim and
 * only points its `importFrom` at the framework-agnostic widget package, so
 * the injected bootstrap mounts the DOM-only widget (picker Case C — every
 * element is pickable; source/componentChain are simply omitted when there
 * is no framework owner). The plugin's `apply: 'serve'` + the widget's
 * runtime `NODE_ENV` guard keep this strictly dev-scoped — there is no
 * production output to leak into, which is also why this is a safer way to
 * hand the widget to a teammate than a CDN script tag.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, searchForWorkspaceRoot, type ViteDevServer } from 'vite';
import { agentDevtools } from '@agent-devtools/vite';

/** Specifier the injected bootstrap imports the widget from. */
const WIDGET_IMPORT = '@agent-devtools/widget-core';
/** Loopback only — the agent server (and this dev server) never leave localhost. */
const DEFAULT_HOST = '127.0.0.1';

export interface RunHtmlServerOptions {
  /** Folder of plain HTML files to serve. Defaults to the current working directory. */
  root?: string;
  /** Preferred port. Vite falls back to the next free port when this one is taken. */
  port?: number;
  /**
   * Mount the widget with an open shadow root. Defaults to `false` (closed),
   * matching the production-default isolation; flip it only for E2E debugging.
   */
  shadowOpen?: boolean;
}

export interface RunHtmlServerResult {
  /** The listening Vite dev server. Call `.close()` to tear it (and the spawned agent server) down. */
  server: ViteDevServer;
  /** The local URL the page is served on, e.g. `http://127.0.0.1:5173/`. */
  url: string;
}

/**
 * Resolve the absolute entry of the widget package from *this* package's
 * perspective. When the runner is invoked through bare `npx` (no local
 * install) the widget lives in npx's cache rather than the served folder's
 * `node_modules`, so we alias the specifier to this absolute path and allow
 * the dev server to read it. Returns null when resolution fails, in which
 * case we fall back to Vite's native bare-specifier resolution (the
 * locally-installed path).
 */
function resolveWidgetEntry(): string | null {
  try {
    return fileURLToPath(import.meta.resolve(WIDGET_IMPORT));
  } catch {
    return null;
  }
}

/** `.../widget-core/dist/index.js` → `.../widget-core` (export depth is one). */
function packageDirOf(entry: string): string {
  return resolve(dirname(entry), '..');
}

function uniquePaths(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}

/**
 * Boot the dev server. The agent server is spawned by the plugin (default),
 * mints a pairing token in memory, and connects to the local Claude Code via
 * the core's ACP provider on first message — so no LLM credentials are wired
 * here. The served workspace (what the agent may read/edit) defaults to the
 * served folder.
 */
export async function runHtmlServer(
  options: RunHtmlServerOptions = {},
): Promise<RunHtmlServerResult> {
  const root = resolve(process.cwd(), options.root ?? '.');
  const widgetEntry = resolveWidgetEntry();
  const fsAllow = uniquePaths([
    root,
    searchForWorkspaceRoot(root),
    ...(widgetEntry ? [packageDirOf(widgetEntry)] : []),
  ]);

  const server = await createServer({
    root,
    // Opinionated runner: ignore any stray vite config in the served folder
    // so behaviour is deterministic regardless of what the planner's
    // directory happens to contain.
    configFile: false,
    // Multi-page: serve every `*.html` directly with no SPA history fallback.
    appType: 'mpa',
    ...(widgetEntry && { resolve: { alias: { [WIDGET_IMPORT]: widgetEntry } } }),
    server: {
      host: DEFAULT_HOST,
      ...(options.port !== undefined && { port: options.port }),
      fs: { allow: fsAllow },
    },
    plugins: [
      agentDevtools({
        importFrom: WIDGET_IMPORT,
        ...(options.shadowOpen !== undefined && { shadowOpen: options.shadowOpen }),
      }),
    ],
  });

  await server.listen();
  return { server, url: resolveLocalUrl(server) };
}

function resolveLocalUrl(server: ViteDevServer): string {
  const local = server.resolvedUrls?.local?.[0];
  if (local) return local;
  const port = server.config.server.port ?? 5173;
  return `http://${DEFAULT_HOST}:${String(port)}/`;
}

export interface RunCliResult {
  exitCode: number;
  /** Null when the CLI only printed help or failed to parse — nothing to tear down. */
  server: ViteDevServer | null;
}

interface ParsedArgs {
  root: string;
  port: number | undefined;
  shadowOpen: boolean;
  help: boolean;
}

const HELP = `agent-devtools-html — serve a plain HTML folder with the agent-devtools widget.

Usage:
  npx @agent-devtools/html [folder] [options]

Arguments:
  folder              Folder of HTML files to serve (default: current directory)

Options:
  --port <number>     Preferred port (default: Vite picks one starting at 5173)
  --open-shadow       Mount the widget with an open shadow root (debugging only)
  -h, --help          Show this help

The widget is dev-only: the dev server injects it into the served HTML and it
is never written to your files. Stop the server (Ctrl-C) and it is gone.
`;

function parseArgs(argv: readonly string[]): ParsedArgs {
  let root = '.';
  let port: number | undefined;
  let shadowOpen = false;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
    } else if (arg === '--open-shadow') {
      shadowOpen = true;
    } else if (arg === '--port') {
      const next = argv[i + 1];
      port = parsePort(next);
      i += 1;
    } else if (arg.startsWith('--port=')) {
      port = parsePort(arg.slice('--port='.length));
    } else if (!arg.startsWith('-')) {
      root = arg;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return { root, port, shadowOpen, help };
}

function parsePort(value: string | undefined): number {
  const parsed = value === undefined ? Number.NaN : Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error('--port requires an integer between 1 and 65535');
  }
  return parsed;
}

/**
 * CLI front door. Parses argv, prints help, boots the server, and reports the
 * URL. The bin wrapper owns signal handling so a Ctrl-C closes the returned
 * server (and the agent server bound to it).
 */
export async function runCli(argv: readonly string[]): Promise<RunCliResult> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n\n${HELP}`);
    return { exitCode: 1, server: null };
  }

  if (args.help) {
    process.stdout.write(HELP);
    return { exitCode: 0, server: null };
  }

  const { server, url } = await runHtmlServer({
    root: args.root,
    ...(args.port !== undefined && { port: args.port }),
    shadowOpen: args.shadowOpen,
  });

  const workspace = resolve(process.cwd(), args.root);
  process.stdout.write(
    `\n  agent-devtools widget ready (dev-only)\n` +
      `  ➜  ${url}\n` +
      `  workspace: ${workspace}\n\n` +
      `  Press Ctrl-C to stop and remove the widget.\n\n`,
  );
  return { exitCode: 0, server };
}
