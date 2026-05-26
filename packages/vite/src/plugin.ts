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
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative as relativePath, resolve as resolvePath } from 'node:path';
import {
  startAgentDevtoolsServer,
  type AgentDevtoolsServerHandle,
  type StartAgentDevtoolsServerOptions,
} from '@agent-devtools/core/server';
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
}

export function agentDevtools(options: AgentDevtoolsPluginOptions = {}): Plugin {
  const enabled = options.enabled ?? true;
  const spawnServer = options.spawnServer ?? true;
  const startServer = options.startServer ?? startAgentDevtoolsServer;
  const shadowOpen = options.shadowOpen ?? readEnv('AGENT_DEVTOOLS_OPEN_SHADOW') === '1';

  let handle: AgentDevtoolsServerHandle | null = null;
  // Resolved at configureServer time (when we have access to the Vite
  // project root). Until then — including transformIndexHtml calls that
  // somehow precede configureServer — fall back to the react default so
  // the bootstrap is always emittable.
  let resolvedImportFrom = resolveImportFrom(options, process.cwd());

  return {
    name: DEFAULT_PLUGIN_NAME,
    apply: 'serve',
    async configureServer(server: ViteDevServer): Promise<void> {
      if (!enabled) return;
      resolvedImportFrom = resolveImportFrom(options, server.config.root);
      // Related-imports middleware sits BEFORE the proxy so the more-specific
      // path wins. The module graph only exists inside the Vite process —
      // the agent server cannot answer this, so we serve it locally.
      server.middlewares.use(
        RELATED_IMPORTS_PATH,
        (req: IncomingMessage, res: ServerResponse): void => {
          handleRelatedImportsRequest(req, res, server);
        },
      );
      // Source-slice middleware — same locality principle as related-imports:
      // the file lives on this machine, no need to bounce through the agent
      // server. Mount before the catch-all proxy.
      server.middlewares.use(
        SOURCE_SLICE_PATH,
        (req: IncomingMessage, res: ServerResponse): void => {
          handleSourceSliceRequest(req, res, server);
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
      const workspace = resolveWorkspace(options.workspace, server.config.root);
      const started = await startServer({
        workspace,
        ...(options.port !== undefined && { port: options.port }),
      });
      handle = started;
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
          children: buildBootstrap(resolvedImportFrom, handle !== null, shadowOpen),
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
 * module graph. Walks `module.importedModules` once and returns each
 * importer's path back to the caller as workspace-relative strings.
 *
 * Security boundary: the requested file is resolved against
 * `server.config.root` and only accepted if the resolved absolute path
 * stays inside that root. Anything outside (`../` escapes, symlink jumps)
 * returns 403. The same root filter is applied to each returned import.
 *
 * Best-effort by contract: a malformed query, an unknown file, or a path
 * outside the root all return `{ imports: [] }` (or 403 for boundary
 * violations) rather than an error — the orchestrator treats an empty
 * list as "no enrichment available" and keeps the base page context.
 */
function handleRelatedImportsRequest(
  req: IncomingMessage,
  res: ServerResponse,
  server: ViteDevServer,
): void {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'method not allowed' }));
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
  const root = server.config.root;
  const absolute = isAbsolute(file) ? file : resolvePath(root, file);
  if (!isInsideRoot(absolute, root)) {
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
        if (!isInsideRoot(importedFile, root)) continue;
        const rel = toWorkspaceRelative(importedFile, root);
        if (rel) imports.push(rel);
      }
    }
  }
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ imports }));
}

function handleSourceSliceRequest(
  req: IncomingMessage,
  res: ServerResponse,
  server: ViteDevServer,
): void {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'method not allowed' }));
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
  const root = server.config.root;
  const absolute = isAbsolute(file) ? file : resolvePath(root, file);
  if (!isInsideRoot(absolute, root)) {
    res.statusCode = 403;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'file outside workspace root' }));
    return;
  }
  void (async (): Promise<void> => {
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

function isInsideRoot(absolute: string, root: string): boolean {
  const rel = relativePath(root, absolute);
  if (rel === '') return true;
  if (rel.startsWith('..')) return false;
  if (isAbsolute(rel)) return false;
  return true;
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

function buildBootstrap(importFrom: string, hasConfig: boolean, shadowOpen: boolean): string {
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
    return [
      `import { mountAgentDevtools, createSettingsStore } from ${spec};`,
      `if (!window.__AGENT_DEVTOOLS_MOUNTED__) {`,
      `  window.__AGENT_DEVTOOLS_MOUNTED__ = true;`,
      `  var __settings = createSettingsStore();`,
      `  var __opts = { settingsStore: __settings };`,
      shadowOpen ? `  __opts.shadowOpen = true;` : `  /* shadow closed (default) */`,
      `  mountAgentDevtools(__opts);`,
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
    `import { mountAgentDevtools, createDefaultTransport, createAgentInfoFetcher, createHandoffRequester, createRelatedImportsFetcher, createSourceSliceFetcher, createPageContextEnricher, createSettingsStore } from ${spec};`,
    `if (!window.__AGENT_DEVTOOLS_MOUNTED__) {`,
    `  window.__AGENT_DEVTOOLS_MOUNTED__ = true;`,
    `  var __cfg = window.${CONFIG_GLOBAL};`,
    `  var __settings = createSettingsStore();`,
    `  var __transport = __cfg ? createDefaultTransport(Object.assign({}, __cfg, { getSettings: function () { return __settings.get(); } })) : undefined;`,
    `  var __getServerInfo = __cfg ? createAgentInfoFetcher(__cfg) : undefined;`,
    `  var __requestHandoff = __cfg ? createHandoffRequester(__cfg) : undefined;`,
    `  var __enrich = __cfg ? createPageContextEnricher({ fetchRelatedImports: createRelatedImportsFetcher(__cfg), fetchSourceSlice: createSourceSliceFetcher(__cfg) }) : undefined;`,
    `  var __opts = { settingsStore: __settings };`,
    `  if (__transport) __opts.transport = __transport;`,
    `  if (__getServerInfo) __opts.getServerInfo = __getServerInfo;`,
    `  if (__requestHandoff) __opts.requestHandoff = __requestHandoff;`,
    `  if (__enrich) __opts.enrichPageContext = __enrich;`,
    shadowOpen ? `  __opts.shadowOpen = true;` : `  /* shadow closed (default) */`,
    `  mountAgentDevtools(__opts);`,
    `}`,
  ]
    .filter((line) => !line.trim().startsWith('/*'))
    .join('\n');
}
