/**
 * Vite plugin that auto-spawns the agent-devtools dev server and injects the
 * widget bootstrap into the dev server's HTML. The bootstrap reads the
 * server URL + pairing token from a window global written immediately above
 * it, builds the default SSE transport, and mounts the widget.
 *
 * Two layers of production safety:
 *   1. `apply: 'serve'` — Vite ignores the plugin entirely during `build`,
 *      so no transform ever runs against a production HTML and no agent
 *      server is spawned. This is the hard guard: even if `enabled` is
 *      misconfigured, production stays clean.
 *   2. `enabled` runtime flag — turns both `configureServer` and
 *      `transformIndexHtml` into no-ops even in dev (useful for env-gated
 *      rollout: `agentDevtools({ enabled: Boolean(import.meta.env.VITE_DEVTOOLS) })`).
 *
 * Pairing-token handling:
 *   - The token is minted in-process by the core's `startAgentDevtoolsServer`,
 *     never persisted to disk.
 *   - It is injected into the HTML as a JS string (window global, not a URL
 *     parameter) so it doesn't leak into browser history.
 *   - The token never touches the host app's source — it only exists in the
 *     transformed HTML response served by Vite.
 *
 * Lifecycle:
 *   - `configureServer` awaits the agent server start so the token + URL are
 *     ready before any browser request hits `transformIndexHtml`.
 *   - The agent server is closed when Vite's `httpServer` emits `close`.
 *   - In `middlewareMode` Vite has no `httpServer`; the agent server is
 *     leaked until process exit (acceptable for dev). Embedders can opt out
 *     via `spawnServer: false` and own the lifecycle.
 */
import type { Plugin, IndexHtmlTransformResult, ViteDevServer, HtmlTagDescriptor } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { request as httpRequest } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join as joinPath,
  relative as relativePath,
  resolve as resolvePath,
} from 'node:path';
import {
  startAgentDevtoolsServer,
  verifyAuthorization,
  type AgentDevtoolsServerHandle,
  type PermissionMode,
  type PermissionPolicy,
  type StartAgentDevtoolsServerOptions,
} from '@agent-devtools/core/server';
import { buildEarlyErrorTrapScript } from '@agent-devtools/widget-core/bootstrap';
import { resolveImportFrom, type Framework } from './framework.js';

const DEFAULT_PLUGIN_NAME = 'agent-devtools';
const CONFIG_GLOBAL = '__AGENT_DEVTOOLS_CONFIG__';
const PROXY_PATH = '/__agent_devtools';
const RELATED_IMPORTS_PATH = `${PROXY_PATH}/related-imports`;
const SOURCE_SLICE_PATH = `${PROXY_PATH}/source-slice`;
const SOURCE_SLICE_RADIUS = 10;
const SOURCE_SLICE_MAX_BYTES = 64 * 1024;

export interface AgentDevtoolsPluginOptions {
  /**
   * Disable the plugin at runtime without removing it from the Vite
   * config. When `false`, `configureServer` and `transformIndexHtml` are
   * no-ops. Defaults to `true`. This is independent of the production
   * guard — the plugin is already ignored by Vite in `build` mode.
   */
  enabled?: boolean;
  /**
   * Framework adapter the injected bootstrap should mount. Defaults to
   * `'auto'`, which reads the host project's `package.json` and picks the
   * first match in priority order: `nuxt` > `next` > `vue` > `react`. Falls
   * back to `react` when nothing matches.
   *
   * Set this explicitly (e.g. `framework: 'vue'`) to skip detection and
   * force one adapter — useful in monorepos where `package.json` does not
   * carry the framework as a direct dependency.
   *
   * If `importFrom` is also provided, it wins.
   */
  framework?: Framework | 'auto';
  /**
   * Module specifier the injected bootstrap imports from. When unset, it
   * is derived from `framework` (defaults to `@agent-devtools/react`).
   * Must export `mountAgentDevtools` and `createDefaultTransport`.
   */
  importFrom?: string;
  /**
   * Spawn the agent server alongside Vite's dev server. Defaults to `true`.
   * Set to `false` to manage the server externally — in that case
   * `transformIndexHtml` injects the bootstrap with no transport, which
   * leaves the widget visible but in an unconfigured state.
   */
  spawnServer?: boolean;
  /**
   * Workspace root the agent may read/edit within. Defaults to the Vite
   * `config.root` resolved at `configureServer` time.
   *
   * Path resolution: absolute paths are passed through verbatim. Relative
   * paths are resolved against the Vite project root (`config.root`), NOT
   * the process working directory — so a monorepo whose example app is
   * nested under the repo root can use `workspace: '..'` and the agent
   * will see the parent repo, regardless of where `vite` was launched.
   */
  workspace?: string;
  /**
   * Preferred port for the spawned agent server. Defaults to the core's
   * default port (with sequential fallback).
   */
  port?: number;
  /**
   * Optional override for `startAgentDevtoolsServer`. Tests inject a stub
   * factory to avoid binding real ports; production code does not pass it.
   */
  startServer?: (options: StartAgentDevtoolsServerOptions) => Promise<AgentDevtoolsServerHandle>;
  /**
   * Mount the widget with an open shadow root. Defaults to `false`. When
   * unset, the env var `AGENT_DEVTOOLS_OPEN_SHADOW=1` flips the default
   * to `true` so Playwright-driven E2E runs can pierce the widget DOM
   * without changing the production-default closed isolation.
   */
  shadowOpen?: boolean;
  /**
   * Whether the floating widget (launcher + composer) is visible on first
   * page load. Defaults to `true`. Set to `false` to ship the widget
   * hidden — the developer brings it back with the Ctrl/Cmd + Shift + ;
   * toggle hotkey. Useful for dev environments where non-frontend
   * operators (backend engineers, QA, designers) load the page and the
   * floating button would otherwise be an unwanted distraction or worse
   * a footgun. The hotkey itself stays armed so toggling back on is one
   * keystroke.
   */
  defaultVisible?: boolean;
  /**
   * Permission mode the spawned agent server applies when the request body
   * omits `permissionMode`. Defaults to `'acceptEdits'` inside the core.
   */
  defaultPermissionMode?: PermissionMode;
  /**
   * Per-action permission policy the spawned agent server applies when the
   * request body omits `permissionPolicy`. When unset, the provider's
   * safe-by-default policy applies (file edits auto, everything else ask).
   */
  defaultPermissionPolicy?: PermissionPolicy;
}

export function agentDevtools(options: AgentDevtoolsPluginOptions = {}): Plugin {
  const enabled = options.enabled ?? true;
  const spawnServer = options.spawnServer ?? true;
  const startServer = options.startServer ?? startAgentDevtoolsServer;
  const shadowOpen = options.shadowOpen ?? readEnv('AGENT_DEVTOOLS_OPEN_SHADOW') === '1';
  const defaultVisible = options.defaultVisible ?? true;

  let handle: AgentDevtoolsServerHandle | null = null;
  // Resolved at configureServer time (when we have access to the Vite
  // project root). Until then — including transformIndexHtml calls that
  // somehow precede configureServer — fall back to the react default so
  // the bootstrap is always emittable.
  let resolvedImportFrom = resolveImportFrom(options, process.cwd());
  // Boundary the enrichment middlewares enforce. Set at configureServer
  // time from `resolveWorkspace(options.workspace, server.config.root)` so
  // a `workspace: '..'` (or any other override) is honored end-to-end
  // rather than silently shrinking back to the Vite project root.
  let resolvedWorkspace: string | null = null;
  // Pairing token expected on every enrichment request. Captured after
  // the agent server spawns. Null until then — middlewares reject with
  // 401 while it is null so an unconfigured plugin cannot leak files.
  let expectedToken: string | null = null;

  return {
    name: DEFAULT_PLUGIN_NAME,
    apply: 'serve',
    async configureServer(server: ViteDevServer): Promise<void> {
      if (!enabled) return;
      resolvedImportFrom = resolveImportFrom(options, server.config.root);
      resolvedWorkspace = resolveWorkspace(options.workspace, server.config.root);
      // Related-imports middleware sits BEFORE the proxy so the more-specific
      // path wins. The module graph only exists inside the Vite process —
      // the agent server cannot answer this, so we serve it locally.
      server.middlewares.use(
        RELATED_IMPORTS_PATH,
        (req: IncomingMessage, res: ServerResponse): void => {
          handleRelatedImportsRequest(req, res, server, resolvedWorkspace, expectedToken);
        },
      );
      // Source-slice middleware — same locality principle as related-imports:
      // the file lives on this machine, no need to bounce through the agent
      // server. Mount before the catch-all proxy.
      server.middlewares.use(
        SOURCE_SLICE_PATH,
        (req: IncomingMessage, res: ServerResponse): void => {
          handleSourceSliceRequest(req, res, server, resolvedWorkspace, expectedToken);
        },
      );
      // Install the proxy middleware unconditionally (even before the agent
      // server is spawned) so that the first browser request after Vite is
      // ready doesn't race the spawn — it gets a 503 from us instead of an
      // immediate "no such route" from Vite. The middleware checks `handle`
      // at request time. We also install it when `spawnServer === false`
      // because embedders may attach their own handle later; in that case
      // the path is the contract the widget calls, the embedder owns the
      // upstream.
      server.middlewares.use(PROXY_PATH, (req: IncomingMessage, res: ServerResponse): void => {
        proxyToAgentServer(req, res, () => handle);
      });
      if (!spawnServer) return;
      const started = await startServer({
        workspace: resolvedWorkspace,
        ...(options.port !== undefined && { port: options.port }),
        ...(options.defaultPermissionMode !== undefined && {
          defaultPermissionMode: options.defaultPermissionMode,
        }),
        ...(options.defaultPermissionPolicy !== undefined && {
          defaultPermissionPolicy: options.defaultPermissionPolicy,
        }),
      });
      handle = started;
      expectedToken = started.pairingToken;
      // Bind teardown to the actual HTTP socket so a graceful Vite shutdown
      // closes the agent server too. In middlewareMode httpServer is null;
      // the agent server is then leaked until process exit (documented).
      const http = server.httpServer;
      if (http) {
        const onClose = (): void => {
          void started.close().catch(() => undefined);
        };
        http.once('close', onClose);
      }
    },
    transformIndexHtml: {
      order: 'pre',
      handler(): IndexHtmlTransformResult | void {
        if (!enabled) return;
        const tags: HtmlTagDescriptor[] = [];
        // L0 ultra-early error trap — a CLASSIC <script> (no `type`
        // attribute) so it executes synchronously in document order and
        // installs capture-phase listeners BEFORE any deferred module
        // (the bootstrap below, plus the host app's own modules) is
        // evaluated. Without this, a host bundle parse error, a top-level
        // await rejection during initial module evaluation, or a sync
        // throw during the host's first render would never reach the
        // observer — the user would see a blank screen with no captured
        // evidence. Order in the head matters: this MUST come first.
        tags.push({
          tag: 'script',
          attrs: {},
          injectTo: 'head',
          children: buildEarlyErrorTrapScript(),
        });
        if (handle) {
          tags.push({
            tag: 'script',
            attrs: {},
            injectTo: 'head',
            children: buildConfigScript(handle.pairingToken),
          });
        }
        tags.push({
          tag: 'script',
          attrs: { type: 'module' },
          injectTo: 'head',
          children: buildBootstrap(resolvedImportFrom, handle !== null, shadowOpen, defaultVisible),
        });
        return { html: '', tags };
      },
    },
  };
}

/**
 * Resolve the user-supplied workspace option against Vite's project root.
 * The Vite plugin's lexical "here" is the Vite project root — so a
 * relative `workspace: '..'` should point one directory above that root,
 * regardless of `process.cwd()`. Absolute paths pass through unchanged.
 */
function resolveWorkspace(option: string | undefined, viteRoot: string): string {
  if (option === undefined) return viteRoot;
  if (isAbsolute(option)) return option;
  return resolvePath(viteRoot, option);
}

function readEnv(name: string): string | undefined {
  const proc =
    typeof globalThis !== 'undefined'
      ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      : undefined;
  return proc?.env?.[name];
}

function buildConfigScript(pairingToken: string): string {
  // Classic (non-module) script so it executes synchronously during head
  // parsing, before the deferred module bootstrap below it. JSON.stringify
  // produces a JS-safe string literal for the path and token.
  //
  // The baseUrl is the same-origin proxy mount, not the agent server's raw
  // `http://127.0.0.1:<port>` URL. Browser fetches stay same-origin (no CORS
  // preflight, no `Access-Control-*` surface) and the loopback binding stays
  // strictly server-side; the proxy middleware in `configureServer` forwards
  // requests to the real upstream.
  const payload = JSON.stringify({ baseUrl: PROXY_PATH, pairingToken });
  return `window.${CONFIG_GLOBAL}=${payload};`;
}

/**
 * Hop-by-hop headers that are connection-specific (RFC 7230 §6.1) and must
 * not be forwarded by an intermediary.
 */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authorization',
  'proxy-authenticate',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

/**
 * Serve a workspace-relative `?file=` query against the Vite dev server's
 * module graph. Walks the picked file's downstream imports (the modules it
 * depends on, via `module.importedModules`) and returns them as
 * workspace-relative strings.
 *
 * Authentication: the same pairing token used by the agent server. Missing
 * or invalid `Authorization: Bearer …` headers return 401 — the endpoint
 * never reads the requested file from disk in that case.
 *
 * Security boundary: the configured workspace (the resolved
 * `options.workspace`, NOT the bare Vite project root) defines the
 * allowed read surface. Both sides of the containment check are resolved
 * through `realpath` so a symlink inside the workspace that targets a
 * file outside it returns 403. Anything outside (`../` escapes, symlink
 * jumps) returns 403. The same boundary is applied to each returned import.
 *
 * Best-effort by contract: a malformed query, an unknown file, or a path
 * outside the workspace all return `{ imports: [] }` (or 403 for boundary
 * violations) rather than an error — the orchestrator treats an empty
 * list as "no enrichment available" and keeps the base page context.
 */
function handleRelatedImportsRequest(
  req: IncomingMessage,
  res: ServerResponse,
  server: ViteDevServer,
  workspace: string | null,
  expectedToken: string | null,
): void {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }
  if (!authorizeRequest(req, res, expectedToken)) return;
  if (!workspace) {
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'workspace not ready' }));
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const file = url.searchParams.get('file');
  if (!file) {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ imports: [] }));
    return;
  }
  const absolute = isAbsolute(file) ? file : resolvePath(workspace, file);
  void (async (): Promise<void> => {
    if (!(await isInsideWorkspace(absolute, workspace))) {
      res.statusCode = 403;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'file outside workspace root' }));
      return;
    }
    const modules = server.moduleGraph.getModulesByFile(absolute);
    const imports: string[] = [];
    const seen = new Set<string>();
    if (modules) {
      for (const mod of modules) {
        for (const imported of mod.importedModules) {
          const importedFile = imported.file;
          if (!importedFile || seen.has(importedFile)) continue;
          seen.add(importedFile);
          if (!(await isInsideWorkspace(importedFile, workspace))) continue;
          const rel = toWorkspaceRelative(importedFile, workspace);
          if (rel) imports.push(rel);
        }
      }
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ imports }));
  })();
}

function handleSourceSliceRequest(
  req: IncomingMessage,
  res: ServerResponse,
  _server: ViteDevServer,
  workspace: string | null,
  expectedToken: string | null,
): void {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }
  if (!authorizeRequest(req, res, expectedToken)) return;
  if (!workspace) {
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'workspace not ready' }));
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const file = url.searchParams.get('file');
  const lineParam = url.searchParams.get('line');
  if (!file || !lineParam) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'file and line are required' }));
    return;
  }
  const line = Number.parseInt(lineParam, 10);
  if (!Number.isFinite(line) || line < 1) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'line must be a positive integer' }));
    return;
  }
  const absolute = isAbsolute(file) ? file : resolvePath(workspace, file);
  void (async (): Promise<void> => {
    if (!(await isInsideWorkspace(absolute, workspace))) {
      res.statusCode = 403;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'file outside workspace root' }));
      return;
    }
    try {
      const stats = await stat(absolute);
      if (!stats.isFile()) {
        res.statusCode = 404;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'not a regular file' }));
        return;
      }
      if (stats.size > SOURCE_SLICE_MAX_BYTES) {
        res.statusCode = 413;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'file too large for slice' }));
        return;
      }
      const text = await readFile(absolute, 'utf8');
      const lines = text.split(/\r?\n/);
      const startLine = Math.max(1, line - SOURCE_SLICE_RADIUS);
      const endLine = Math.min(lines.length, line + SOURCE_SLICE_RADIUS);
      const code = lines.slice(startLine - 1, endLine).join('\n');
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ code, startLine, endLine }));
    } catch {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'file not readable' }));
    }
  })();
}

/**
 * Enforce the pairing-token bearer scheme on enrichment endpoints. Returns
 * `false` when the request was rejected (response already sent) so the
 * caller short-circuits without touching disk or the module graph.
 *
 * Rejection cases:
 *   - `expectedToken` is null (agent server has not yet spawned, or
 *     `spawnServer: false` with no embedder-supplied token).
 *   - `Authorization` header missing, wrong scheme, or wrong value.
 *
 * Mirrors the shape of `app.ts`'s 401 response so the widget transport
 * sees one consistent unauthorized contract whether the request hit the
 * agent server directly or one of the Vite-local enrichment endpoints.
 */
function authorizeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedToken: string | null,
): boolean {
  if (!expectedToken || !verifyAuthorization(req.headers.authorization, expectedToken)) {
    res.statusCode = 401;
    res.setHeader('content-type', 'application/json');
    res.setHeader('www-authenticate', 'Bearer realm="agent-devtools"');
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return false;
  }
  return true;
}

/**
 * Canonical containment check. Both `absolute` and `workspace` are resolved
 * through `realpath` so a symlink inside the workspace that targets a path
 * outside it is rejected. When the requested file does not yet exist
 * (`/tmp/.../Ghost.tsx`) `realpath` walks up to the nearest existing
 * ancestor — necessary on macOS, where `/tmp` is itself a symlink to
 * `/private/tmp` and a naive lexical compare against the realpathed
 * workspace would reject every missing-file probe as "outside".
 */
async function isInsideWorkspace(absolute: string, workspace: string): Promise<boolean> {
  const [canonicalAbsolute, canonicalWorkspace] = await Promise.all([
    realpathOrAncestor(absolute),
    realpathOrAncestor(workspace),
  ]);
  const left = canonicalAbsolute ?? absolute;
  const right = canonicalWorkspace ?? workspace;
  return isInsideLexical(left, right);
}

function isInsideLexical(absolute: string, root: string): boolean {
  const rel = relativePath(root, absolute);
  if (rel === '') return true;
  if (rel.startsWith('..')) return false;
  if (isAbsolute(rel)) return false;
  return true;
}

/**
 * Resolve `realpath(path)`, or — if the leaf does not exist — recursively
 * resolve the deepest existing ancestor and rebuild the missing tail on
 * top of it. Returns null only when even the filesystem root cannot be
 * resolved (e.g. caller passed an empty string).
 */
async function realpathOrAncestor(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch {
    const parent = dirname(path);
    if (parent === path) return null;
    const parentReal = await realpathOrAncestor(parent);
    if (!parentReal) return null;
    return joinPath(parentReal, basename(path));
  }
}

function toWorkspaceRelative(absolute: string, root: string): string | undefined {
  const rel = relativePath(root, absolute);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return undefined;
  return rel.split('\\').join('/');
}

function proxyToAgentServer(
  req: IncomingMessage,
  res: ServerResponse,
  getHandle: () => AgentDevtoolsServerHandle | null,
): void {
  const handle = getHandle();
  if (!handle) {
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'agent server not ready' }));
    return;
  }
  const target = new URL(handle.url);
  // connect strips the mount prefix from req.url, so it is the upstream
  // path (e.g. '/v1/agent/stream'). Fall back to '/' for the unlikely case
  // where Vite hands us an empty URL.
  const upstreamPath = req.url && req.url.length > 0 ? req.url : '/';

  const forwardedHeaders: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    forwardedHeaders[key] = value;
  }
  forwardedHeaders.host = target.host;

  const upstreamReq = httpRequest(
    {
      host: target.hostname,
      port: target.port ? Number(target.port) : 80,
      method: req.method ?? 'GET',
      path: upstreamPath,
      headers: forwardedHeaders,
    },
    (upstreamRes) => {
      // Strip hop-by-hop response headers too — node's HTTP server will set
      // its own connection management for the downstream socket.
      const responseHeaders: Record<string, string | string[]> = {};
      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        if (value === undefined) continue;
        if (HOP_BY_HOP.has(key.toLowerCase())) continue;
        responseHeaders[key] = value;
      }
      res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders);
      upstreamRes.pipe(res);
    },
  );

  upstreamReq.on('error', (err: Error) => {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: `upstream error: ${err.message}` }));
    } else {
      res.end();
    }
  });

  // If the downstream client disconnects, abort the upstream request so we
  // don't keep the agent server busy.
  res.on('close', () => {
    if (!res.writableEnded) upstreamReq.destroy();
  });

  req.pipe(upstreamReq);
}

function buildBootstrap(
  importFrom: string,
  hasConfig: boolean,
  shadowOpen: boolean,
  defaultVisible: boolean,
): string {
  const spec = JSON.stringify(importFrom);
  // Idempotent mount marker. Even though a full page reload tears down the
  // global, an inline `<script type="module">` can occasionally run twice
  // when Vite hot-injects an updated HTML head while the module graph is
  // still warm. We bail in that case so the user doesn't see two widget
  // shadow roots stacked on top of each other. Conversation persistence
  // (see packages/react/src/stream/storage.ts) carries the chat history
  // across the fresh mount on a normal full reload.
  if (!hasConfig) {
    // No server spawned: mount the widget without a transport. The
    // orchestrator surfaces a friendly "agent server not configured"
    // message when the user submits, so the empty state is obvious. We
    // still create a settings store so the panel renders + persists user
    // choices (provider, permission mode) for the moment the server arrives.
    //
    // The mount call itself is wrapped in try/catch — if mountAgentDevtools
    // throws (shadow-root attach failure, custom element collision on the
    // host page, settings storage corrupt), the throw is routed to the L0
    // early trap via the dispatched ErrorEvent so the host page keeps
    // working and the next observer.start() can drain it.
    return [
      `import { mountAgentDevtools, createSettingsStore } from ${spec};`,
      `if (!window.__AGENT_DEVTOOLS_MOUNTED__) {`,
      `  window.__AGENT_DEVTOOLS_MOUNTED__ = true;`,
      `  try {`,
      `    var __settings = createSettingsStore();`,
      `    var __opts = { settingsStore: __settings };`,
      shadowOpen ? `    __opts.shadowOpen = true;` : `    /* shadow closed (default) */`,
      defaultVisible
        ? `    /* defaultVisible: true (default) */`
        : `    __opts.defaultVisible = false;`,
      `    mountAgentDevtools(__opts);`,
      `  } catch (err) {`,
      `    try { console.error('[agent-devtools] mount failed', err); } catch (_) {}`,
      `    try { window.dispatchEvent(new ErrorEvent('error', { message: 'agent-devtools mount failed: ' + (err && err.message ? err.message : err), error: err })); } catch (_) {}`,
      `  }`,
      `}`,
    ]
      .filter((line) => !line.trim().startsWith('/*'))
      .join('\n');
  }
  // Shared SettingsStore reference: the panel mutates it, the transport
  // reads from it on every send via `getSettings`, and the agent info
  // fetcher is bound to the same config so the panel knows the workspace
  // root + registered providers without a second source of truth.
  return [
    `import * as __agentDevtools from ${spec};`,
    `import { mountAgentDevtools, createDefaultTransport, createAgentInfoFetcher, createHandoffRequester, createRelatedImportsFetcher, createSourceSliceFetcher, createPageContextEnricher, createSettingsStore } from ${spec};`,
    `if (!window.__AGENT_DEVTOOLS_MOUNTED__) {`,
    `  window.__AGENT_DEVTOOLS_MOUNTED__ = true;`,
    `  try {`,
    `    var __cfg = window.${CONFIG_GLOBAL};`,
    `    var __settings = createSettingsStore();`,
    `    var __transport = __cfg ? createDefaultTransport(Object.assign({}, __cfg, { getSettings: function () { return __settings.get(); } })) : undefined;`,
    `    var __getServerInfo = __cfg ? createAgentInfoFetcher(__cfg) : undefined;`,
    // Feature-detect the slash-command catalogue fetcher: the same injected
    // bootstrap is reused across every adapter specifier, and most adapters do
    // not re-export `createAgentCommandsFetcher` yet. A hard named import would
    // be a link-time error for those adapters, so we read it off the module
    // namespace and only build the fetcher when it is actually exported. The
    // html runner (spec `@agent-devtools/widget-core`) gets the prefetch;
    // other adapters degrade gracefully to the stream-only path.
    `    var __getAgentCommands = (__cfg && typeof __agentDevtools.createAgentCommandsFetcher === 'function') ? __agentDevtools.createAgentCommandsFetcher(__cfg) : undefined;`,
    `    var __requestHandoff = __cfg ? createHandoffRequester(Object.assign({}, __cfg, { getClientSessionId: __transport ? function () { return __transport.getClientSessionId && __transport.getClientSessionId(); } : undefined })) : undefined;`,
    `    var __enrich = __cfg ? createPageContextEnricher({ fetchRelatedImports: createRelatedImportsFetcher(__cfg), fetchSourceSlice: createSourceSliceFetcher(__cfg) }) : undefined;`,
    `    var __opts = { settingsStore: __settings };`,
    `    if (__transport) __opts.transport = __transport;`,
    `    if (__getServerInfo) __opts.getServerInfo = __getServerInfo;`,
    `    if (__getAgentCommands) __opts.getAgentCommands = __getAgentCommands;`,
    `    if (__requestHandoff) __opts.requestHandoff = __requestHandoff;`,
    `    if (__enrich) __opts.enrichPageContext = __enrich;`,
    shadowOpen ? `    __opts.shadowOpen = true;` : `    /* shadow closed (default) */`,
    defaultVisible
      ? `    /* defaultVisible: true (default) */`
      : `    __opts.defaultVisible = false;`,
    `    mountAgentDevtools(__opts);`,
    `  } catch (err) {`,
    `    try { console.error('[agent-devtools] mount failed', err); } catch (_) {}`,
    `    try { window.dispatchEvent(new ErrorEvent('error', { message: 'agent-devtools mount failed: ' + (err && err.message ? err.message : err), error: err })); } catch (_) {}`,
    `  }`,
    `}`,
  ]
    .filter((line) => !line.trim().startsWith('/*'))
    .join('\n');
}
