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
import { isAbsolute, resolve as resolvePath } from 'node:path';
import {
  startAgentDevtoolsServer,
  type AgentDevtoolsServerHandle,
  type StartAgentDevtoolsServerOptions,
} from '@agent-devtools/core/server';

const DEFAULT_IMPORT_FROM = '@agent-devtools/react';
const DEFAULT_PLUGIN_NAME = 'agent-devtools';
const CONFIG_GLOBAL = '__AGENT_DEVTOOLS_CONFIG__';
const PROXY_PATH = '/__agent_devtools';

export interface AgentDevtoolsPluginOptions {
  /**
   * Disable the plugin at runtime without removing it from the Vite
   * config. When `false`, `configureServer` and `transformIndexHtml` are
   * no-ops. Defaults to `true`. This is independent of the production
   * guard — the plugin is already ignored by Vite in `build` mode.
   */
  enabled?: boolean;
  /**
   * Module specifier the injected bootstrap imports from. Defaults to
   * `@agent-devtools/react`. Must export `mountAgentDevtools` and
   * `createDefaultTransport`.
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
  const importFrom = options.importFrom ?? DEFAULT_IMPORT_FROM;
  const spawnServer = options.spawnServer ?? true;
  const startServer = options.startServer ?? startAgentDevtoolsServer;
  const shadowOpen = options.shadowOpen ?? readEnv('AGENT_DEVTOOLS_OPEN_SHADOW') === '1';

  let handle: AgentDevtoolsServerHandle | null = null;

  return {
    name: DEFAULT_PLUGIN_NAME,
    apply: 'serve',
    async configureServer(server: ViteDevServer): Promise<void> {
      if (!enabled) return;
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
          children: buildBootstrap(importFrom, handle !== null, shadowOpen),
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
    `import { mountAgentDevtools, createDefaultTransport, createAgentInfoFetcher, createHandoffRequester, createSettingsStore } from ${spec};`,
    `if (!window.__AGENT_DEVTOOLS_MOUNTED__) {`,
    `  window.__AGENT_DEVTOOLS_MOUNTED__ = true;`,
    `  var __cfg = window.${CONFIG_GLOBAL};`,
    `  var __settings = createSettingsStore();`,
    `  var __transport = __cfg ? createDefaultTransport(Object.assign({}, __cfg, { getSettings: function () { return __settings.get(); } })) : undefined;`,
    `  var __getServerInfo = __cfg ? createAgentInfoFetcher(__cfg) : undefined;`,
    `  var __requestHandoff = __cfg ? createHandoffRequester(__cfg) : undefined;`,
    `  var __opts = { settingsStore: __settings };`,
    `  if (__transport) __opts.transport = __transport;`,
    `  if (__getServerInfo) __opts.getServerInfo = __getServerInfo;`,
    `  if (__requestHandoff) __opts.requestHandoff = __requestHandoff;`,
    shadowOpen ? `  __opts.shadowOpen = true;` : `  /* shadow closed (default) */`,
    `  mountAgentDevtools(__opts);`,
    `}`,
  ]
    .filter((line) => !line.trim().startsWith('/*'))
    .join('\n');
}
