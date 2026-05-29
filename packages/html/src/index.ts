/**
 * `@agent-devtools/html` — a tiny npx runner that serves plain HTML through a
 * programmatic Vite dev server with the agent-devtools widget injected. It
 * exists so a non-developer (e.g. a planner sketching pages via Claude Code)
 * can launch the floating widget on plain HTML with a single command:
 *
 *     npx @agent-devtools/html ./my-pages          # serve a folder
 *     npx @agent-devtools/html ./my-pages/about.html  # serve a single file
 *
 * When the positional argument is a directory, Vite's MPA mode serves every
 * `*.html` underneath it (the root URL hits `index.html` when present). When
 * the argument is a single `.html` (or `.htm`) file, the runner uses the
 * file's parent directory as the Vite root and points the printed URL at the
 * file's basename — so the user lands on that specific page without having to
 * rename it to `index.html` first.
 *
 * Nothing here re-implements injection, transport, the pairing-token flow, or
 * the dev-only guard. It reuses the existing Vite plugin verbatim and only
 * points its `importFrom` at the framework-agnostic widget package, so the
 * injected bootstrap mounts the DOM-only widget (picker Case C — every element
 * is pickable; source/componentChain are simply omitted when there is no
 * framework owner). The plugin's `apply: 'serve'` + the widget's runtime
 * `NODE_ENV` guard keep this strictly dev-scoped — there is no production
 * output to leak into, which is also why this is a safer way to hand the
 * widget to a teammate than a CDN script tag.
 */
import { statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, searchForWorkspaceRoot, type ViteDevServer } from 'vite';
import { agentDevtools } from '@agent-devtools/vite';

/** Specifier the injected bootstrap imports the widget from. */
const WIDGET_IMPORT = '@agent-devtools/widget-core';
/** Loopback only — the agent server (and this dev server) never leave localhost. */
const DEFAULT_HOST = '127.0.0.1';
/** File extensions accepted when the positional argument is a single file. */
const HTML_EXTENSIONS: readonly string[] = ['.html', '.htm'];

export interface RunHtmlServerOptions {
  /** Folder of plain HTML files to serve. Defaults to the current working directory. */
  root?: string;
  /**
   * Optional single HTML file (basename only) to suffix on the printed URL so
   * the user lands directly on that page instead of `/`. Used by the CLI when
   * the positional argument is a single file; ignored when omitted.
   */
  entryFile?: string;
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
  /** The local URL the page is served on, e.g. `http://127.0.0.1:5173/about.html`. */
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

export interface ResolvedEntry {
  /** Absolute path of the folder Vite should serve from. */
  root: string;
  /** Basename of a specific file to point the URL at, or null for `/`. */
  entryFile: string | null;
}

/**
 * Inspect the raw positional argument from argv and split it into the Vite
 * root + an optional single-file URL suffix. Symlinks are followed (default
 * `statSync` behaviour) so a symlinked HTML file is treated as the file it
 * points at. Throws with a clear, user-facing message for the two failure
 * modes the CLI surfaces verbatim: path does not exist, and path is a file
 * with a non-HTML extension. The folder branch matches the runner's original
 * behaviour exactly — same root, no URL suffix.
 */
export function resolveEntry(rawPath: string, cwd: string = process.cwd()): ResolvedEntry {
  const absolute = resolve(cwd, rawPath);
  let stat;
  try {
    stat = statSync(absolute);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      throw new Error(`path does not exist: ${absolute}`, { cause: error });
    }
    throw error;
  }
  if (stat.isDirectory()) {
    return { root: absolute, entryFile: null };
  }
  if (stat.isFile()) {
    const lower = absolute.toLowerCase();
    const accepted = HTML_EXTENSIONS.some((ext) => lower.endsWith(ext));
    if (!accepted) {
      throw new Error(
        `path is not an HTML file: ${absolute} (expected one of: ${HTML_EXTENSIONS.join(', ')})`,
      );
    }
    return { root: dirname(absolute), entryFile: basename(absolute) };
  }
  throw new Error(`path is neither a file nor a directory: ${absolute}`);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && typeof (error as NodeJS.ErrnoException).code === 'string';
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
  return { server, url: resolveLocalUrl(server, options.entryFile ?? null) };
}

function resolveLocalUrl(server: ViteDevServer, entryFile: string | null): string {
  const base = server.resolvedUrls?.local?.[0] ?? fallbackBase(server);
  if (!entryFile) return base;
  // Vite's resolvedUrls entry always ends with `/`; preserve that contract so
  // `<base><entryFile>` lands at e.g. `http://127.0.0.1:5173/about.html`.
  return base.endsWith('/') ? `${base}${entryFile}` : `${base}/${entryFile}`;
}

function fallbackBase(server: ViteDevServer): string {
  const port = server.config.server.port ?? 5173;
  return `http://${DEFAULT_HOST}:${String(port)}/`;
}

export interface RunCliResult {
  exitCode: number;
  /** Null when the CLI only printed help or failed to parse — nothing to tear down. */
  server: ViteDevServer | null;
}

export interface ParsedArgs {
  /** Raw positional path as the user typed it (or '.' when omitted). */
  path: string;
  port: number | undefined;
  shadowOpen: boolean;
  help: boolean;
}

const HELP = `agent-devtools-html — serve plain HTML with the agent-devtools widget.

Usage:
  npx @agent-devtools/html [path] [options]

Arguments:
  path                Folder of HTML files OR a single .html / .htm file
                      (default: current directory). When a single file is
                      given, its parent directory is served and the printed
                      URL points at the file.

Options:
  --port <number>     Preferred port (default: Vite picks one starting at 5173)
  --open-shadow       Mount the widget with an open shadow root (debugging only)
  -h, --help          Show this help

The widget is dev-only: the dev server injects it into the served HTML and it
is never written to your files. Stop the server (Ctrl-C) and it is gone.
`;

export function parseArgs(argv: readonly string[]): ParsedArgs {
  let path = '.';
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
      path = arg;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return { path, port, shadowOpen, help };
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

  let resolved: ResolvedEntry;
  try {
    resolved = resolveEntry(args.path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return { exitCode: 1, server: null };
  }

  const { server, url } = await runHtmlServer({
    root: resolved.root,
    ...(resolved.entryFile !== null && { entryFile: resolved.entryFile }),
    ...(args.port !== undefined && { port: args.port }),
    shadowOpen: args.shadowOpen,
  });

  process.stdout.write(
    `\n  agent-devtools widget ready (dev-only)\n` +
      `  ➜  ${url}\n` +
      `  workspace: ${resolved.root}\n\n` +
      `  Press Ctrl-C to stop and remove the widget.\n\n`,
  );
  return { exitCode: 0, server };
}
