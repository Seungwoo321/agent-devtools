import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { ViteDevServer } from 'vite';
import { agentDevtools, type AgentDevtoolsPluginOptions } from './plugin.js';
import type {
  AgentDevtoolsServerHandle,
  StartAgentDevtoolsServerOptions,
} from '@agent-devtools/core/server';

type MiddlewareHandler = (req: IncomingMessage, res: ServerResponse, next?: () => void) => void;

interface CapturedMiddleware {
  readonly path: string;
  readonly handler: MiddlewareHandler;
}

interface HtmlTag {
  tag: string;
  attrs?: Record<string, string | boolean>;
  injectTo?: string;
  children?: string;
}

interface TransformResult {
  html: string;
  tags: HtmlTag[];
}

function runTransform(plugin: ReturnType<typeof agentDevtools>): TransformResult | undefined {
  const hook = plugin.transformIndexHtml;
  if (!hook || typeof hook === 'function') {
    throw new Error('expected object-form transformIndexHtml hook');
  }
  const handler = hook.handler;
  const ctx = { server: undefined, path: '/index.html', filename: 'index.html' } as never;
  const result = (
    handler as unknown as (html: string, ctx: unknown) => TransformResult | undefined
  )('<html><head></head><body></body></html>', ctx);
  return result;
}

/**
 * Semantic tag finders — the injected tag list is `[earlyTrap, (config?),
 * bootstrap]` and the trap was added later than these tests, so we look up
 * by attributes/content rather than by index. Each finder throws on miss so
 * `findX(result)!.children!` is a safe pattern in the assertions.
 */
function findBootstrap(result: TransformResult): HtmlTag {
  const tag = result.tags.find((t) => t.attrs?.type === 'module');
  if (!tag) throw new Error('expected a module bootstrap script');
  return tag;
}
function findConfig(result: TransformResult): HtmlTag {
  const tag = result.tags.find(
    (t) => t.attrs?.type === undefined && (t.children ?? '').includes('__AGENT_DEVTOOLS_CONFIG__'),
  );
  if (!tag) throw new Error('expected a config script');
  return tag;
}
function findEarlyTrap(result: TransformResult): HtmlTag {
  const tag = result.tags.find(
    (t) =>
      t.attrs?.type === undefined && (t.children ?? '').includes('__AGENT_DEVTOOLS_EARLY_ERRORS__'),
  );
  if (!tag) throw new Error('expected an early-trap script');
  return tag;
}

interface FakeServerSetup {
  readonly close: () => Promise<void>;
  readonly httpServer: EventEmitter;
  readonly viteServer: ViteDevServer;
  readonly middlewares: CapturedMiddleware[];
}

function makeFakeViteServer(
  opts: { workspace?: string; moduleGraph?: unknown } = {},
): FakeServerSetup {
  const httpServer = new EventEmitter();
  const close = vi.fn(async () => undefined);
  const middlewares: CapturedMiddleware[] = [];
  // connect-style `use(path, handler)` capture so tests can directly invoke
  // the middleware Vite would mount for us.
  const use = (path: string, handler: MiddlewareHandler): unknown => {
    middlewares.push({ path, handler });
    return undefined;
  };
  const viteServer = {
    config: { root: opts.workspace ?? '/fake/root' },
    httpServer,
    middlewares: { use },
    ...(opts.moduleGraph !== undefined && { moduleGraph: opts.moduleGraph }),
  } as unknown as ViteDevServer;
  return { close, httpServer, viteServer, middlewares };
}

function makeStartServerStub(
  opts: {
    url?: string;
    pairingToken?: string;
    close?: () => Promise<void>;
  } = {},
): {
  start: (o: StartAgentDevtoolsServerOptions) => Promise<AgentDevtoolsServerHandle>;
  captured: StartAgentDevtoolsServerOptions[];
  closeFn: () => Promise<void>;
} {
  const captured: StartAgentDevtoolsServerOptions[] = [];
  const closeFn = opts.close ?? (async () => undefined);
  const handle: AgentDevtoolsServerHandle = {
    url: opts.url ?? 'http://127.0.0.1:54321',
    port: 54321,
    workspace: { root: '/fake/root' } as never,
    pairingToken: opts.pairingToken ?? 'tok-test-1',
    close: closeFn,
    started: {} as never,
  };
  const start = async (o: StartAgentDevtoolsServerOptions): Promise<AgentDevtoolsServerHandle> => {
    captured.push(o);
    return handle;
  };
  return { start, captured, closeFn };
}

async function runConfigureServer(
  plugin: ReturnType<typeof agentDevtools>,
  server: ViteDevServer,
): Promise<void> {
  const hook = plugin.configureServer;
  if (!hook) throw new Error('expected configureServer hook');
  if (typeof hook === 'function') {
    await hook.call({} as never, server);
    return;
  }
  await hook.handler.call({} as never, server);
}

function buildPlugin(
  overrides: Partial<AgentDevtoolsPluginOptions> = {},
): ReturnType<typeof agentDevtools> {
  return agentDevtools(overrides);
}

describe('agentDevtools()', () => {
  it('returns a plugin named "agent-devtools"', () => {
    expect(buildPlugin().name).toBe('agent-devtools');
  });

  it('applies to dev (serve) only — production builds skip the plugin', () => {
    expect(buildPlugin().apply).toBe('serve');
  });

  it('exposes an object-form transformIndexHtml hook that runs in pre order', () => {
    const plugin = buildPlugin();
    expect(plugin.transformIndexHtml).toBeTypeOf('object');
    const hook = plugin.transformIndexHtml as { order?: string };
    expect(hook.order).toBe('pre');
  });

  it('without a spawned server, injects an early-trap classic script + a module bootstrap into <head>', () => {
    const result = runTransform(buildPlugin({ spawnServer: false }));
    expect(result).toBeDefined();
    // tags = [earlyTrap, bootstrap] — no config script since no server.
    expect(result!.tags).toHaveLength(2);
    const boot = findBootstrap(result!);
    expect(boot.tag).toBe('script');
    expect(boot.attrs).toEqual({ type: 'module' });
    expect(boot.injectTo).toBe('head');
    expect(typeof boot.children).toBe('string');
    const trap = findEarlyTrap(result!);
    expect(trap.tag).toBe('script');
    // Classic script — no `type` attribute, runs synchronously before the
    // deferred module bootstrap.
    expect(trap.attrs).toEqual({});
    expect(trap.injectTo).toBe('head');
  });

  it('uses the default importFrom = "@agent-devtools/react"', () => {
    const result = runTransform(buildPlugin({ spawnServer: false }));
    const code = findBootstrap(result!).children!;
    expect(code).toContain('"@agent-devtools/react"');
    expect(code).toContain('mountAgentDevtools');
    // Even with no server, the bootstrap creates a SettingsStore so the
    // panel renders + persists user choices (the same store reference
    // wires up the transport later when one is available).
    expect(code).toContain('createSettingsStore');
    expect(code).toContain('settingsStore: __settings');
    expect(code).toContain('mountAgentDevtools(__opts);');
  });

  it('shares a single SettingsStore between transport and mount when the server is spawned', async () => {
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start });
    const { viteServer } = makeFakeViteServer();
    await runConfigureServer(plugin, viteServer);
    const result = runTransform(plugin);
    const boot = findBootstrap(result!).children!;
    expect(boot).toContain('createSettingsStore');
    // Transport receives `getSettings` bound to the same store instance,
    // not a fresh copy — toggling provider in the panel must take effect
    // on the very next send().
    expect(boot).toContain('getSettings');
    expect(boot).toContain('__settings.get()');
    // Settings panel is hydrated by the same `__cfg`-bound info fetcher.
    expect(boot).toContain('createAgentInfoFetcher');
    expect(boot).toContain('__opts.getServerInfo');
    expect(boot).toContain('settingsStore: __settings');
    // Slash-command catalogue is prefetched at mount so the composer's
    // autocomplete works on the first keystroke. The fetcher is feature-detected
    // off the module namespace because most adapters do not re-export it yet —
    // a hard named import would be a link-time error for those specifiers.
    expect(boot).toContain('import * as __agentDevtools from');
    expect(boot).toContain("typeof __agentDevtools.createAgentCommandsFetcher === 'function'");
    expect(boot).toContain('__opts.getAgentCommands');
    // Terminal-handoff requester is bound to the same config so the modal's
    // POST /v1/agent/handoff inherits the same baseUrl + pairing token.
    expect(boot).toContain('createHandoffRequester');
    expect(boot).toContain('__opts.requestHandoff');
    // The handoff requester also pulls the tab-scoped clientSessionId from
    // the transport so the server can surface a matching `claude --resume`
    // sibling command alongside the always-emitted append-system-prompt one.
    expect(boot).toContain('getClientSessionId');
    expect(boot).toContain('__transport.getClientSessionId');
    // Idempotent mount guard — a second eval of the bootstrap (e.g. HMR
    // injects a fresh head, or some pathological reload races the module
    // graph) must not stack a second widget on top of the first.
    expect(boot).toContain('__AGENT_DEVTOOLS_MOUNTED__');
  });

  it('emits an idempotent mount guard even on the no-server bootstrap', () => {
    const result = runTransform(buildPlugin({ spawnServer: false }));
    const code = findBootstrap(result!).children!;
    expect(code).toContain('__AGENT_DEVTOOLS_MOUNTED__');
  });

  it('respects a custom importFrom', () => {
    const result = runTransform(
      buildPlugin({ spawnServer: false, importFrom: '@my-org/devtools' }),
    );
    const code = findBootstrap(result!).children!;
    expect(code).toContain('"@my-org/devtools"');
  });

  it('selects the matching adapter when framework is set explicitly (no detection)', async () => {
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start, framework: 'vue' });
    const { viteServer } = makeFakeViteServer({ workspace: '/host/app' });
    await runConfigureServer(plugin, viteServer);
    const result = runTransform(plugin);
    const boot = findBootstrap(result!).children!;
    expect(boot).toContain('"@agent-devtools/vue"');
  });

  it('selects @agent-devtools/vue2 when framework: "vue2"', async () => {
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start, framework: 'vue2' });
    const { viteServer } = makeFakeViteServer({ workspace: '/host/app' });
    await runConfigureServer(plugin, viteServer);
    const result = runTransform(plugin);
    const boot = findBootstrap(result!).children!;
    expect(boot).toContain('"@agent-devtools/vue2"');
  });

  it('explicit importFrom wins over framework', async () => {
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({
      startServer: start,
      framework: 'vue',
      importFrom: '@override/pkg',
    });
    const { viteServer } = makeFakeViteServer({ workspace: '/host/app' });
    await runConfigureServer(plugin, viteServer);
    const result = runTransform(plugin);
    const boot = findBootstrap(result!).children!;
    expect(boot).toContain('"@override/pkg"');
    expect(boot).not.toContain('"@agent-devtools/vue"');
  });

  it('escapes the import specifier safely (JSON-stringified)', () => {
    const result = runTransform(buildPlugin({ spawnServer: false, importFrom: 'a"b' }));
    const code = findBootstrap(result!).children!;
    expect(code).toContain('"a\\"b"');
  });

  it('is a no-op when enabled: false', () => {
    const result = runTransform(buildPlugin({ enabled: false }));
    expect(result).toBeUndefined();
  });

  it('keeps the returned html field empty (uses tags-only injection)', () => {
    const result = runTransform(buildPlugin({ spawnServer: false }));
    expect(result!.html).toBe('');
  });

  it('omits the defaultVisible flag when defaulted (visible on first load)', () => {
    const result = runTransform(buildPlugin({ spawnServer: false }));
    const code = findBootstrap(result!).children!;
    // True is the orchestrator's own default — propagating an explicit
    // `defaultVisible: true` is unnecessary noise in the injected script.
    expect(code).not.toContain('defaultVisible');
  });

  it('propagates defaultVisible: false through the no-server bootstrap', () => {
    const result = runTransform(buildPlugin({ spawnServer: false, defaultVisible: false }));
    const code = findBootstrap(result!).children!;
    expect(code).toContain('__opts.defaultVisible = false;');
  });

  it('propagates defaultVisible: false through the server-spawned bootstrap', async () => {
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start, defaultVisible: false });
    const { viteServer } = makeFakeViteServer();
    await runConfigureServer(plugin, viteServer);
    const result = runTransform(plugin);
    const boot = findBootstrap(result!).children!;
    expect(boot).toContain('__opts.defaultVisible = false;');
  });

  it('injects the L0 early-trap classic script before the deferred module bootstrap', () => {
    const result = runTransform(buildPlugin({ spawnServer: false }));
    expect(result).toBeDefined();
    const tags = result!.tags;
    const trapIdx = tags.findIndex((t) =>
      (t.children ?? '').includes('__AGENT_DEVTOOLS_EARLY_ERRORS__'),
    );
    const bootIdx = tags.findIndex((t) => t.attrs?.type === 'module');
    expect(trapIdx).toBeGreaterThanOrEqual(0);
    expect(bootIdx).toBeGreaterThanOrEqual(0);
    // Order matters: a CLASSIC script in document order beats a deferred
    // module script. Vite respects the array order when emitting head tags.
    expect(trapIdx).toBeLessThan(bootIdx);
    const trap = tags[trapIdx]!;
    expect(trap.attrs).toEqual({});
    expect(trap.children).toContain('addEventListener("error"');
    expect(trap.children).toContain('addEventListener("unhandledrejection"');
  });

  it('wraps mountAgentDevtools in try/catch so a mount throw routes back to the trap', () => {
    const result = runTransform(buildPlugin({ spawnServer: false }));
    const code = findBootstrap(result!).children!;
    expect(code).toContain('try {');
    expect(code).toContain('mountAgentDevtools(__opts);');
    expect(code).toContain('} catch (err) {');
    // The mount-failure path dispatches an ErrorEvent so the L0 trap catches
    // it through the same path it captures any other window error.
    expect(code).toContain("window.dispatchEvent(new ErrorEvent('error'");
    expect(code).toContain("'agent-devtools mount failed");
  });

  it('also wraps the server-spawned bootstrap mount in try/catch', async () => {
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start });
    const { viteServer } = makeFakeViteServer();
    await runConfigureServer(plugin, viteServer);
    const result = runTransform(plugin);
    const boot = findBootstrap(result!).children!;
    expect(boot).toContain('try {');
    expect(boot).toContain('mountAgentDevtools(__opts);');
    expect(boot).toContain('} catch (err) {');
    expect(boot).toContain("window.dispatchEvent(new ErrorEvent('error'");
  });
});

describe('agentDevtools() — server spawn integration', () => {
  it('spawns the agent server during configureServer with workspace=config.root', async () => {
    const { start, captured } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start });
    const { viteServer } = makeFakeViteServer({ workspace: '/host/app' });
    await runConfigureServer(plugin, viteServer);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.workspace).toBe('/host/app');
  });

  it('passes through an absolute workspace option verbatim', async () => {
    const { start, captured } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start, workspace: '/custom/ws' });
    const { viteServer } = makeFakeViteServer({ workspace: '/host/app' });
    await runConfigureServer(plugin, viteServer);
    expect(captured[0]?.workspace).toBe('/custom/ws');
  });

  it('resolves a relative workspace option against the Vite project root, not process.cwd()', async () => {
    // Monorepo use case: Vite's `config.root` is `/repo/examples/react-vite`
    // and the user passes `workspace: '..'` meaning "the repo root, not the
    // example app". Resolution must be against the Vite root, not wherever
    // the user happens to have launched `vite` from.
    const { start, captured } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start, workspace: '..' });
    const { viteServer } = makeFakeViteServer({ workspace: '/repo/examples/react-vite' });
    await runConfigureServer(plugin, viteServer);
    expect(captured[0]?.workspace).toBe('/repo/examples');
  });

  it('resolves a nested relative workspace option against the Vite project root', async () => {
    const { start, captured } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start, workspace: '../..' });
    const { viteServer } = makeFakeViteServer({ workspace: '/repo/examples/react-vite' });
    await runConfigureServer(plugin, viteServer);
    expect(captured[0]?.workspace).toBe('/repo');
  });

  it('passes the configured port through to the server start', async () => {
    const { start, captured } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start, port: 8765 });
    const { viteServer } = makeFakeViteServer();
    await runConfigureServer(plugin, viteServer);
    expect(captured[0]?.port).toBe(8765);
  });

  it('after spawn, transformIndexHtml emits trap + config + module bootstrap', async () => {
    const { start } = makeStartServerStub({
      url: 'http://127.0.0.1:4317',
      pairingToken: 'tok-XYZ',
    });
    const plugin = buildPlugin({ startServer: start });
    const { viteServer } = makeFakeViteServer();
    await runConfigureServer(plugin, viteServer);
    const result = runTransform(plugin);
    expect(result).toBeDefined();
    // tags = [earlyTrap, config, bootstrap] — exact ordering enforced in
    // the dedicated ordering test below.
    expect(result!.tags).toHaveLength(3);
    const cfg = findConfig(result!);
    const boot = findBootstrap(result!);
    expect(cfg.tag).toBe('script');
    expect(cfg.attrs).toEqual({});
    expect(cfg.injectTo).toBe('head');
    expect(cfg.children).toContain('window.__AGENT_DEVTOOLS_CONFIG__');
    // The injected baseUrl is the same-origin proxy mount, not the agent
    // server's raw http://127.0.0.1:<port> URL — keeps browser fetches
    // same-origin (no CORS preflight) while the loopback binding stays
    // strictly server-side.
    expect(cfg.children).toContain('"baseUrl":"/__agent_devtools"');
    expect(cfg.children).not.toContain('http://127.0.0.1');
    expect(cfg.children).toContain('"pairingToken":"tok-XYZ"');
    expect(boot.tag).toBe('script');
    expect(boot.attrs).toEqual({ type: 'module' });
    expect(boot.children).toContain('createDefaultTransport');
    expect(boot.children).toContain('mountAgentDevtools');
    expect(boot.children).toContain('__AGENT_DEVTOOLS_CONFIG__');
  });

  it('the injected config does NOT embed the token in the URL', async () => {
    const { start } = makeStartServerStub({ pairingToken: 'secret-token' });
    const plugin = buildPlugin({ startServer: start });
    const { viteServer } = makeFakeViteServer();
    await runConfigureServer(plugin, viteServer);
    const result = runTransform(plugin);
    const cfg = findConfig(result!).children!;
    const boot = findBootstrap(result!).children!;
    // Token must appear in the config global only, never concatenated into a URL.
    expect(cfg.includes('secret-token')).toBe(true);
    expect(boot.includes('secret-token')).toBe(false);
    expect(cfg).not.toContain('?token=');
    expect(cfg).not.toContain('&token=');
  });

  it('closes the spawned server when Vite emits httpServer "close"', async () => {
    const closeFn = vi.fn(async () => undefined);
    const { start } = makeStartServerStub({ close: closeFn });
    const plugin = buildPlugin({ startServer: start });
    const { httpServer, viteServer } = makeFakeViteServer();
    await runConfigureServer(plugin, viteServer);
    expect(closeFn).not.toHaveBeenCalled();
    httpServer.emit('close');
    // The handler kicks an async close; await a tick.
    await new Promise((r) => setTimeout(r, 0));
    expect(closeFn).toHaveBeenCalledTimes(1);
  });

  it('skips spawning when spawnServer: false', async () => {
    const { start, captured } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start, spawnServer: false });
    const { viteServer } = makeFakeViteServer();
    await runConfigureServer(plugin, viteServer);
    expect(captured).toHaveLength(0);
    // And transformIndexHtml falls back to the no-transport bootstrap.
    const result = runTransform(plugin);
    // tags = [earlyTrap, bootstrap] — no config script since no server.
    expect(result!.tags).toHaveLength(2);
    expect(findBootstrap(result!).children).not.toContain('createDefaultTransport');
  });

  it('skips spawning when enabled: false even if spawnServer is true', async () => {
    const { start, captured } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start, enabled: false });
    const { viteServer } = makeFakeViteServer();
    await runConfigureServer(plugin, viteServer);
    expect(captured).toHaveLength(0);
  });

  it('does not crash in middlewareMode (no httpServer on the Vite server)', async () => {
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start });
    const viteServer = {
      config: { root: '/host/app' },
      httpServer: null,
      middlewares: { use: () => undefined },
    } as unknown as ViteDevServer;
    await expect(runConfigureServer(plugin, viteServer)).resolves.toBeUndefined();
  });
});

describe('agentDevtools() — same-origin proxy middleware', () => {
  function makeFakeRes(): {
    res: ServerResponse;
    chunks: Buffer[];
    statusCode: () => number;
    headers: () => Record<string, string | string[]>;
    ended: () => Promise<void>;
    isEnded: () => boolean;
    closeEmitters: Array<() => void>;
  } {
    // Base on a real Writable so the upstream IncomingMessage can `.pipe()`
    // into us — pipe needs `.once`/`.emit`/event-emitter semantics.
    const chunks: Buffer[] = [];
    const headers: Record<string, string | string[]> = {};
    let statusCode = 200;
    let headersSent = false;
    const closeEmitters: Array<() => void> = [];
    let resolveEnded: () => void;
    const endedPromise = new Promise<void>((r) => {
      resolveEnded = r;
    });
    let isEnded = false;
    const res = new Writable({
      write(chunk: Buffer | string, _enc, cb: () => void) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        cb();
      },
      final(cb: () => void) {
        isEnded = true;
        resolveEnded();
        cb();
      },
    }) as unknown as ServerResponse & { [k: string]: unknown };
    Object.defineProperty(res, 'headersSent', {
      get: (): boolean => headersSent,
    });
    Object.defineProperty(res, 'statusCode', {
      get: (): number => statusCode,
      set: (v: number) => {
        statusCode = v;
      },
    });
    res.setHeader = function setHeader(key: string, value: string | string[]): unknown {
      headers[key.toLowerCase()] = value;
      return res;
    } as typeof res.setHeader;
    res.writeHead = function writeHead(
      s: number,
      h?: Record<string, string | string[]>,
    ): typeof res {
      statusCode = s;
      if (h) for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = v;
      headersSent = true;
      return res;
    } as typeof res.writeHead;
    const origOn = (res as unknown as { on: (e: string, f: () => void) => unknown }).on.bind(res);
    (res as unknown as { on: (e: string, f: () => void) => unknown }).on = function on(
      event: string,
      handler: () => void,
    ): unknown {
      if (event === 'close') closeEmitters.push(handler);
      return origOn(event, handler);
    };
    return {
      res: res as ServerResponse,
      chunks,
      statusCode: (): number => statusCode,
      headers: (): Record<string, string | string[]> => headers,
      ended: (): Promise<void> => endedPromise,
      isEnded: (): boolean => isEnded,
      closeEmitters,
    };
  }

  it('installs a middleware at /__agent_devtools during configureServer', async () => {
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start });
    const { viteServer, middlewares } = makeFakeViteServer();
    await runConfigureServer(plugin, viteServer);
    // More-specific paths are mounted first so the catch-all proxy at
    // /__agent_devtools doesn't shadow them: related-imports, then
    // source-slice, then the agent server proxy.
    expect(middlewares).toHaveLength(3);
    expect(middlewares[0]!.path).toBe('/__agent_devtools/related-imports');
    expect(middlewares[1]!.path).toBe('/__agent_devtools/source-slice');
    expect(middlewares[2]!.path).toBe('/__agent_devtools');
  });

  it('installs the proxy middleware even when spawnServer: false (embedder owns upstream)', async () => {
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start, spawnServer: false });
    const { viteServer, middlewares } = makeFakeViteServer();
    await runConfigureServer(plugin, viteServer);
    expect(middlewares).toHaveLength(3);
  });

  it('does NOT install the proxy when enabled: false', async () => {
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start, enabled: false });
    const { viteServer, middlewares } = makeFakeViteServer();
    await runConfigureServer(plugin, viteServer);
    expect(middlewares).toHaveLength(0);
  });

  it('forwards method, path, headers, body, status, response headers and streaming body to a real upstream', async () => {
    // Stand up a tiny upstream HTTP server that records what it received
    // and emits a multi-chunk SSE-style response so we exercise streaming.
    const http = await import('node:http');
    interface Captured {
      method?: string | undefined;
      url?: string | undefined;
      authorization?: string | string[] | undefined;
      contentType?: string | string[] | undefined;
      bodyHex: string;
    }
    const captured: Captured = { bodyHex: '' };
    const upstream = http.createServer((req, res) => {
      captured.method = req.method;
      captured.url = req.url;
      captured.authorization = req.headers.authorization;
      captured.contentType = req.headers['content-type'];
      const bufs: Buffer[] = [];
      req.on('data', (c: Buffer) => bufs.push(c));
      req.on('end', () => {
        captured.bodyHex = Buffer.concat(bufs).toString('hex');
        res.statusCode = 207; // Distinguish from any default-200 path.
        res.setHeader('content-type', 'text/event-stream');
        res.setHeader('x-custom', 'pass-through');
        res.setHeader('transfer-encoding', 'chunked'); // Hop-by-hop — must be stripped.
        res.write('event: first\ndata: hello\n\n');
        // Two chunks so the test exercises pipe-streaming, not buffering.
        setTimeout(() => {
          res.end('event: second\ndata: world\n\n');
        }, 5);
      });
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const addr = upstream.address();
    if (!addr || typeof addr === 'string') throw new Error('no upstream address');
    const upstreamUrl = `http://127.0.0.1:${String(addr.port)}`;

    try {
      const { start } = makeStartServerStub({ url: upstreamUrl, pairingToken: 'tok-proxy' });
      const plugin = buildPlugin({ startServer: start });
      const { viteServer, middlewares } = makeFakeViteServer();
      await runConfigureServer(plugin, viteServer);

      const { res, chunks, statusCode, headers, ended, isEnded, closeEmitters } = makeFakeRes();
      // connect strips the mount prefix from req.url before calling the
      // middleware — so the proxy sees just `/v1/agent/stream`.
      const reqBody = Buffer.from(JSON.stringify({ prompt: 'hi' }));
      let reqDataHandler: ((c: Buffer) => void) | undefined;
      let reqEndHandler: (() => void) | undefined;
      const req = {
        method: 'POST',
        url: '/v1/agent/stream',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer tok-proxy',
          host: 'localhost:5173',
          // Hop-by-hop — must be stripped.
          connection: 'keep-alive',
          'transfer-encoding': 'chunked',
        },
        on(event: string, handler: (c?: Buffer) => void): unknown {
          if (event === 'data') reqDataHandler = handler as (c: Buffer) => void;
          if (event === 'end') reqEndHandler = handler as () => void;
          return req;
        },
        pipe(dest: Writable): Writable {
          // Mimic stream.pipe: emit our recorded body then end.
          dest.end(reqBody);
          return dest;
        },
      } as unknown as IncomingMessage;
      // middlewares[2] is the proxy; middlewares[0]/[1] are the
      // related-imports and source-slice handlers (more-specific paths).
      middlewares[2]!.handler(req, res);

      // Drive the optional data/end emitters so listeners installed by the
      // middleware (if any) still receive their notifications. The actual
      // body delivery happens through `pipe()` above.
      reqDataHandler?.(reqBody);
      reqEndHandler?.();

      // Wait until the middleware has piped the response and ended `res`.
      await Promise.race([
        ended(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('proxy did not end res within 2s')), 2000),
        ),
      ]);
      expect(isEnded()).toBe(true);
      expect(statusCode()).toBe(207);
      const responseHeaders = headers();
      expect(responseHeaders['content-type']).toBe('text/event-stream');
      expect(responseHeaders['x-custom']).toBe('pass-through');
      // Hop-by-hop response headers MUST be stripped on the way out.
      expect(responseHeaders['transfer-encoding']).toBeUndefined();
      const body = Buffer.concat(chunks).toString('utf8');
      expect(body).toContain('event: first');
      expect(body).toContain('event: second');
      expect(body).toContain('hello');
      expect(body).toContain('world');

      // Upstream-side: method, path, auth, content-type and body all
      // arrive intact; the loopback `host` header is rewritten to the
      // upstream's host:port (no leakage of the browser-facing host).
      expect(captured.method).toBe('POST');
      expect(captured.url).toBe('/v1/agent/stream');
      expect(captured.authorization).toBe('Bearer tok-proxy');
      expect(captured.contentType).toBe('application/json');
      expect(captured.bodyHex).toBe(reqBody.toString('hex'));

      // Sanity: the close listener exists so an early client disconnect can
      // abort the upstream request.
      expect(closeEmitters.length).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve, reject) => {
        upstream.close((err) => (err ? reject(err) : resolve()));
      });
    }
  }, 10000);

  it('returns 503 if a request hits the proxy before the agent server has spawned', async () => {
    // spawnServer: false simulates the no-handle state at request time —
    // the same logical state as a race between Vite ready and spawn.
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start, spawnServer: false });
    const { viteServer, middlewares } = makeFakeViteServer();
    await runConfigureServer(plugin, viteServer);
    const { res, chunks, statusCode, ended, isEnded } = makeFakeRes();
    const req = { method: 'POST', url: '/v1/agent/stream', headers: {} } as IncomingMessage;
    // middlewares[2] is the proxy; middlewares[0]/[1] are the
    // related-imports and source-slice handlers (more-specific paths).
    middlewares[2]!.handler(req, res);
    await Promise.race([
      ended(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('503 path did not end res within 2s')), 2000),
      ),
    ]);
    expect(statusCode()).toBe(503);
    expect(isEnded()).toBe(true);
    const body = Buffer.concat(chunks).toString('utf8');
    expect(body).toContain('"error":"agent server not ready"');
  });
});

// Authorization header that matches the default `pairingToken: 'tok-test-1'`
// returned by `makeStartServerStub` — kept as a module-scope constant so the
// enrichment-middleware tests don't have to re-state the pairing contract on
// every request.
const AUTH_HEADERS = { authorization: 'Bearer tok-test-1' } as const;

describe('agentDevtools() — related-imports middleware', () => {
  interface FakeModule {
    file?: string;
    importedModules: Iterable<FakeModule>;
  }

  function makeModuleGraph(entries: Record<string, FakeModule[]>): {
    getModulesByFile(file: string): Set<FakeModule> | undefined;
  } {
    return {
      getModulesByFile(file: string): Set<FakeModule> | undefined {
        const mods = entries[file];
        return mods ? new Set(mods) : undefined;
      },
    };
  }

  function makeJsonRes(): {
    res: ServerResponse;
    body: () => string;
    status: () => number;
    ended: () => Promise<void>;
  } {
    const chunks: Buffer[] = [];
    let statusCode = 200;
    let resolveEnded: () => void;
    const endedPromise = new Promise<void>((r) => {
      resolveEnded = r;
    });
    const res = new Writable({
      write(chunk: Buffer | string, _enc, cb: () => void) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        cb();
      },
      final(cb: () => void) {
        resolveEnded();
        cb();
      },
    }) as unknown as ServerResponse;
    Object.defineProperty(res, 'statusCode', {
      get: (): number => statusCode,
      set: (v: number) => {
        statusCode = v;
      },
    });
    res.setHeader = function setHeader(): unknown {
      return res;
    } as typeof res.setHeader;
    return {
      res,
      body: (): string => Buffer.concat(chunks).toString('utf8'),
      status: (): number => statusCode,
      ended: (): Promise<void> => endedPromise,
    };
  }

  it('returns workspace-relative imports for a known file', async () => {
    const root = '/repo/root';
    const moduleGraph = makeModuleGraph({
      [`${root}/src/Picked.tsx`]: [
        {
          file: `${root}/src/Picked.tsx`,
          importedModules: [
            { file: `${root}/src/App.tsx`, importedModules: [] },
            { file: `${root}/src/util.ts`, importedModules: [] },
          ],
        },
      ],
    });
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start });
    const { viteServer, middlewares } = makeFakeViteServer({ workspace: root, moduleGraph });
    await runConfigureServer(plugin, viteServer);
    const { res, body, status, ended } = makeJsonRes();
    const req = {
      method: 'GET',
      url: '/?file=src%2FPicked.tsx',
      headers: { ...AUTH_HEADERS },
    } as IncomingMessage;
    middlewares[0]!.handler(req, res);
    await ended();
    expect(status()).toBe(200);
    expect(JSON.parse(body())).toEqual({ imports: ['src/App.tsx', 'src/util.ts'] });
  });

  it('rejects files outside the workspace root with 403', async () => {
    const root = '/repo/root';
    const moduleGraph = makeModuleGraph({});
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start });
    const { viteServer, middlewares } = makeFakeViteServer({ workspace: root, moduleGraph });
    await runConfigureServer(plugin, viteServer);
    const { res, body, status, ended } = makeJsonRes();
    const req = {
      method: 'GET',
      url: `/?file=${encodeURIComponent('../../etc/passwd')}`,
      headers: { ...AUTH_HEADERS },
    } as IncomingMessage;
    middlewares[0]!.handler(req, res);
    await ended();
    expect(status()).toBe(403);
    expect(JSON.parse(body())).toEqual({ error: 'file outside workspace root' });
  });

  it('returns empty imports when the file is unknown to the module graph', async () => {
    const root = '/repo/root';
    const moduleGraph = makeModuleGraph({});
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start });
    const { viteServer, middlewares } = makeFakeViteServer({ workspace: root, moduleGraph });
    await runConfigureServer(plugin, viteServer);
    const { res, body, status, ended } = makeJsonRes();
    const req = {
      method: 'GET',
      url: '/?file=src%2FMissing.tsx',
      headers: { ...AUTH_HEADERS },
    } as IncomingMessage;
    middlewares[0]!.handler(req, res);
    await ended();
    expect(status()).toBe(200);
    expect(JSON.parse(body())).toEqual({ imports: [] });
  });

  it('returns empty imports when ?file is missing', async () => {
    const root = '/repo/root';
    const moduleGraph = makeModuleGraph({});
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start });
    const { viteServer, middlewares } = makeFakeViteServer({ workspace: root, moduleGraph });
    await runConfigureServer(plugin, viteServer);
    const { res, body, status, ended } = makeJsonRes();
    const req = { method: 'GET', url: '/', headers: { ...AUTH_HEADERS } } as IncomingMessage;
    middlewares[0]!.handler(req, res);
    await ended();
    expect(status()).toBe(200);
    expect(JSON.parse(body())).toEqual({ imports: [] });
  });

  it('rejects non-GET requests with 405', async () => {
    const root = '/repo/root';
    const moduleGraph = makeModuleGraph({});
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start });
    const { viteServer, middlewares } = makeFakeViteServer({ workspace: root, moduleGraph });
    await runConfigureServer(plugin, viteServer);
    const { res, status, ended } = makeJsonRes();
    const req = {
      method: 'POST',
      url: '/?file=src%2FPicked.tsx',
      headers: { ...AUTH_HEADERS },
    } as IncomingMessage;
    middlewares[0]!.handler(req, res);
    await ended();
    expect(status()).toBe(405);
  });

  it('drops imports without a resolved file and dedupes repeats', async () => {
    const root = '/repo/root';
    const dup = { file: `${root}/src/Shared.ts`, importedModules: [] };
    const moduleGraph = makeModuleGraph({
      [`${root}/src/Picked.tsx`]: [
        {
          file: `${root}/src/Picked.tsx`,
          importedModules: [
            { importedModules: [] }, // no file — skipped
            dup,
            dup, // exact same module — deduped
            { file: `${root}/src/Other.ts`, importedModules: [] },
          ],
        },
      ],
    });
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start });
    const { viteServer, middlewares } = makeFakeViteServer({ workspace: root, moduleGraph });
    await runConfigureServer(plugin, viteServer);
    const { res, body, status, ended } = makeJsonRes();
    const req = {
      method: 'GET',
      url: '/?file=src%2FPicked.tsx',
      headers: { ...AUTH_HEADERS },
    } as IncomingMessage;
    middlewares[0]!.handler(req, res);
    await ended();
    expect(status()).toBe(200);
    expect(JSON.parse(body())).toEqual({ imports: ['src/Shared.ts', 'src/Other.ts'] });
  });

  it('filters imports whose paths resolve outside the workspace root', async () => {
    const root = '/repo/root';
    const moduleGraph = makeModuleGraph({
      [`${root}/src/Picked.tsx`]: [
        {
          file: `${root}/src/Picked.tsx`,
          importedModules: [
            { file: `${root}/src/InsideOK.ts`, importedModules: [] },
            { file: '/elsewhere/leak.ts', importedModules: [] },
          ],
        },
      ],
    });
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start });
    const { viteServer, middlewares } = makeFakeViteServer({ workspace: root, moduleGraph });
    await runConfigureServer(plugin, viteServer);
    const { res, body, status, ended } = makeJsonRes();
    const req = {
      method: 'GET',
      url: '/?file=src%2FPicked.tsx',
      headers: { ...AUTH_HEADERS },
    } as IncomingMessage;
    middlewares[0]!.handler(req, res);
    await ended();
    expect(status()).toBe(200);
    expect(JSON.parse(body())).toEqual({ imports: ['src/InsideOK.ts'] });
  });

  it('rejects requests without an Authorization header with 401', async () => {
    const root = '/repo/root';
    const moduleGraph = makeModuleGraph({
      [`${root}/src/Picked.tsx`]: [
        {
          file: `${root}/src/Picked.tsx`,
          importedModules: [{ file: `${root}/src/App.tsx`, importedModules: [] }],
        },
      ],
    });
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start });
    const { viteServer, middlewares } = makeFakeViteServer({ workspace: root, moduleGraph });
    await runConfigureServer(plugin, viteServer);
    const { res, body, status, ended } = makeJsonRes();
    const req = {
      method: 'GET',
      url: '/?file=src%2FPicked.tsx',
      headers: {},
    } as IncomingMessage;
    middlewares[0]!.handler(req, res);
    await ended();
    expect(status()).toBe(401);
    expect(JSON.parse(body())).toEqual({ error: 'unauthorized' });
  });

  it('rejects requests with the wrong bearer value with 401', async () => {
    const root = '/repo/root';
    const moduleGraph = makeModuleGraph({});
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start });
    const { viteServer, middlewares } = makeFakeViteServer({ workspace: root, moduleGraph });
    await runConfigureServer(plugin, viteServer);
    const { res, status, ended } = makeJsonRes();
    const req = {
      method: 'GET',
      url: '/?file=src%2FPicked.tsx',
      headers: { authorization: 'Bearer tok-wrong' },
    } as IncomingMessage;
    middlewares[0]!.handler(req, res);
    await ended();
    expect(status()).toBe(401);
  });

  it('honors the workspace option even when it points outside the Vite project root', async () => {
    // Vite's project root is `${parent}/inner` but the developer chose a
    // workspace one level up so the agent can see siblings. A file inside
    // that resolved workspace — but outside Vite's project root — must be
    // accepted by the boundary check.
    const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const parent = await mkdtemp(join(tmpdir(), 'agent-devtools-ws-'));
    try {
      const inner = join(parent, 'inner');
      const sibling = join(parent, 'sibling');
      await mkdir(inner, { recursive: true });
      await mkdir(sibling, { recursive: true });
      await writeFile(join(sibling, 'Outside.tsx'), 'export {};\n');
      const moduleGraph = makeModuleGraph({
        [join(sibling, 'Outside.tsx')]: [
          {
            file: join(sibling, 'Outside.tsx'),
            importedModules: [{ file: join(sibling, 'helper.ts'), importedModules: [] }],
          },
        ],
      });
      const { start } = makeStartServerStub();
      const plugin = buildPlugin({ startServer: start, workspace: '..' });
      const { viteServer, middlewares } = makeFakeViteServer({ workspace: inner, moduleGraph });
      await runConfigureServer(plugin, viteServer);
      const { res, body, status, ended } = makeJsonRes();
      const req = {
        method: 'GET',
        url: `/?file=${encodeURIComponent('sibling/Outside.tsx')}`,
        headers: { ...AUTH_HEADERS },
      } as IncomingMessage;
      middlewares[0]!.handler(req, res);
      await ended();
      expect(status()).toBe(200);
      expect(JSON.parse(body())).toEqual({ imports: ['sibling/helper.ts'] });
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});

describe('agentDevtools() — source-slice middleware', () => {
  // Reuse the JSON-collecting writable from the related-imports tests by
  // re-declaring it locally — kept inline so this describe block stands on
  // its own next to the source-slice production code.
  function makeJsonRes(): {
    res: ServerResponse;
    body: () => string;
    status: () => number;
    ended: () => Promise<void>;
  } {
    const chunks: Buffer[] = [];
    let statusCode = 200;
    let resolveEnded: () => void;
    const endedPromise = new Promise<void>((r) => {
      resolveEnded = r;
    });
    const res = new Writable({
      write(chunk: Buffer | string, _enc, cb: () => void) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        cb();
      },
      final(cb: () => void) {
        resolveEnded();
        cb();
      },
    }) as unknown as ServerResponse;
    Object.defineProperty(res, 'statusCode', {
      get: (): number => statusCode,
      set: (v: number) => {
        statusCode = v;
      },
    });
    res.setHeader = function setHeader(): unknown {
      return res;
    } as typeof res.setHeader;
    return {
      res,
      body: (): string => Buffer.concat(chunks).toString('utf8'),
      status: (): number => statusCode,
      ended: (): Promise<void> => endedPromise,
    };
  }

  async function withTempWorkspace<T>(
    files: Record<string, string | Buffer>,
    body: (root: string) => Promise<T>,
  ): Promise<T> {
    const { mkdtemp, writeFile, mkdir, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { dirname, join } = await import('node:path');
    const root = await mkdtemp(join(tmpdir(), 'agent-devtools-slice-'));
    try {
      for (const [rel, content] of Object.entries(files)) {
        const abs = join(root, rel);
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, content);
      }
      return await body(root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  it('returns a ±10-line slice clamped to file boundaries (happy path)', async () => {
    const file = Array.from({ length: 30 }, (_, i) => `line${String(i + 1)}`).join('\n');
    await withTempWorkspace({ 'src/Picked.tsx': file }, async (root) => {
      const { start } = makeStartServerStub();
      const plugin = buildPlugin({ startServer: start });
      const { viteServer, middlewares } = makeFakeViteServer({ workspace: root });
      await runConfigureServer(plugin, viteServer);
      const { res, body, status, ended } = makeJsonRes();
      const req = {
        method: 'GET',
        url: '/?file=src%2FPicked.tsx&line=15',
        headers: { ...AUTH_HEADERS },
      } as IncomingMessage;
      middlewares[1]!.handler(req, res);
      await ended();
      expect(status()).toBe(200);
      const payload = JSON.parse(body()) as {
        code: string;
        startLine: number;
        endLine: number;
      };
      expect(payload.startLine).toBe(5);
      expect(payload.endLine).toBe(25);
      expect(payload.code.split('\n')[0]).toBe('line5');
      expect(payload.code.split('\n').at(-1)).toBe('line25');
    });
  });

  it('clamps the window when the picked line is near the file start', async () => {
    const file = Array.from({ length: 30 }, (_, i) => `line${String(i + 1)}`).join('\n');
    await withTempWorkspace({ 'src/Edge.tsx': file }, async (root) => {
      const { start } = makeStartServerStub();
      const plugin = buildPlugin({ startServer: start });
      const { viteServer, middlewares } = makeFakeViteServer({ workspace: root });
      await runConfigureServer(plugin, viteServer);
      const { res, body, status, ended } = makeJsonRes();
      const req = {
        method: 'GET',
        url: '/?file=src%2FEdge.tsx&line=2',
        headers: { ...AUTH_HEADERS },
      } as IncomingMessage;
      middlewares[1]!.handler(req, res);
      await ended();
      expect(status()).toBe(200);
      const payload = JSON.parse(body()) as {
        code: string;
        startLine: number;
        endLine: number;
      };
      expect(payload.startLine).toBe(1);
      expect(payload.endLine).toBe(12);
    });
  });

  it('returns 400 when ?file or ?line is missing', async () => {
    const root = '/repo/root';
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start });
    const { viteServer, middlewares } = makeFakeViteServer({ workspace: root });
    await runConfigureServer(plugin, viteServer);
    const { res, status, ended } = makeJsonRes();
    const req = {
      method: 'GET',
      url: '/?file=src%2FX.tsx',
      headers: { ...AUTH_HEADERS },
    } as IncomingMessage;
    middlewares[1]!.handler(req, res);
    await ended();
    expect(status()).toBe(400);
  });

  it('returns 400 when ?line is not a positive integer', async () => {
    const root = '/repo/root';
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start });
    const { viteServer, middlewares } = makeFakeViteServer({ workspace: root });
    await runConfigureServer(plugin, viteServer);
    const { res, status, ended } = makeJsonRes();
    const req = {
      method: 'GET',
      url: '/?file=src%2FX.tsx&line=zero',
      headers: { ...AUTH_HEADERS },
    } as IncomingMessage;
    middlewares[1]!.handler(req, res);
    await ended();
    expect(status()).toBe(400);
  });

  it('returns 403 when the file resolves outside the workspace root', async () => {
    const root = '/repo/root';
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start });
    const { viteServer, middlewares } = makeFakeViteServer({ workspace: root });
    await runConfigureServer(plugin, viteServer);
    const { res, body, status, ended } = makeJsonRes();
    const req = {
      method: 'GET',
      url: `/?file=${encodeURIComponent('../../etc/passwd')}&line=1`,
      headers: { ...AUTH_HEADERS },
    } as IncomingMessage;
    middlewares[1]!.handler(req, res);
    await ended();
    expect(status()).toBe(403);
    expect(JSON.parse(body())).toEqual({ error: 'file outside workspace root' });
  });

  it('rejects non-GET requests with 405', async () => {
    const root = '/repo/root';
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start });
    const { viteServer, middlewares } = makeFakeViteServer({ workspace: root });
    await runConfigureServer(plugin, viteServer);
    const { res, status, ended } = makeJsonRes();
    const req = {
      method: 'POST',
      url: '/?file=src%2FX.tsx&line=1',
      headers: { ...AUTH_HEADERS },
    } as IncomingMessage;
    middlewares[1]!.handler(req, res);
    await ended();
    expect(status()).toBe(405);
  });

  it('returns 404 when the resolved path is not a regular file', async () => {
    await withTempWorkspace({}, async (root) => {
      const { mkdir } = await import('node:fs/promises');
      const { join } = await import('node:path');
      await mkdir(join(root, 'src'), { recursive: true });
      const { start } = makeStartServerStub();
      const plugin = buildPlugin({ startServer: start });
      const { viteServer, middlewares } = makeFakeViteServer({ workspace: root });
      await runConfigureServer(plugin, viteServer);
      const { res, status, ended } = makeJsonRes();
      const req = {
        method: 'GET',
        url: '/?file=src&line=1',
        headers: { ...AUTH_HEADERS },
      } as IncomingMessage;
      middlewares[1]!.handler(req, res);
      await ended();
      expect(status()).toBe(404);
    });
  });

  it('returns 413 when the file exceeds the configured byte cap', async () => {
    // 64KB + 1 to exceed SOURCE_SLICE_MAX_BYTES.
    const big = 'x'.repeat(64 * 1024 + 1);
    await withTempWorkspace({ 'src/Big.tsx': big }, async (root) => {
      const { start } = makeStartServerStub();
      const plugin = buildPlugin({ startServer: start });
      const { viteServer, middlewares } = makeFakeViteServer({ workspace: root });
      await runConfigureServer(plugin, viteServer);
      const { res, status, ended } = makeJsonRes();
      const req = {
        method: 'GET',
        url: '/?file=src%2FBig.tsx&line=1',
        headers: { ...AUTH_HEADERS },
      } as IncomingMessage;
      middlewares[1]!.handler(req, res);
      await ended();
      expect(status()).toBe(413);
    });
  });

  it('returns 404 when the file does not exist on disk', async () => {
    await withTempWorkspace({}, async (root) => {
      const { start } = makeStartServerStub();
      const plugin = buildPlugin({ startServer: start });
      const { viteServer, middlewares } = makeFakeViteServer({ workspace: root });
      await runConfigureServer(plugin, viteServer);
      const { res, status, ended } = makeJsonRes();
      const req = {
        method: 'GET',
        url: '/?file=src%2FGhost.tsx&line=1',
        headers: { ...AUTH_HEADERS },
      } as IncomingMessage;
      middlewares[1]!.handler(req, res);
      await ended();
      expect(status()).toBe(404);
    });
  });

  it('rejects requests without an Authorization header with 401 and never reads the file', async () => {
    const file = Array.from({ length: 30 }, (_, i) => `line${String(i + 1)}`).join('\n');
    await withTempWorkspace({ 'src/Picked.tsx': file }, async (root) => {
      const { start } = makeStartServerStub();
      const plugin = buildPlugin({ startServer: start });
      const { viteServer, middlewares } = makeFakeViteServer({ workspace: root });
      await runConfigureServer(plugin, viteServer);
      const { res, body, status, ended } = makeJsonRes();
      const req = {
        method: 'GET',
        url: '/?file=src%2FPicked.tsx&line=15',
        headers: {},
      } as IncomingMessage;
      middlewares[1]!.handler(req, res);
      await ended();
      expect(status()).toBe(401);
      expect(JSON.parse(body())).toEqual({ error: 'unauthorized' });
    });
  });

  it('rejects requests with the wrong bearer value with 401 and never reads the file', async () => {
    const file = Array.from({ length: 30 }, (_, i) => `line${String(i + 1)}`).join('\n');
    await withTempWorkspace({ 'src/Picked.tsx': file }, async (root) => {
      const { start } = makeStartServerStub();
      const plugin = buildPlugin({ startServer: start });
      const { viteServer, middlewares } = makeFakeViteServer({ workspace: root });
      await runConfigureServer(plugin, viteServer);
      const { res, status, ended } = makeJsonRes();
      const req = {
        method: 'GET',
        url: '/?file=src%2FPicked.tsx&line=15',
        headers: { authorization: 'Bearer tok-wrong' },
      } as IncomingMessage;
      middlewares[1]!.handler(req, res);
      await ended();
      expect(status()).toBe(401);
    });
  });

  it('returns 403 when a symlink inside the workspace targets a file outside the workspace', async () => {
    // Real symlink that resolves outside the workspace via realpath. The
    // lexical path looks workspace-relative ("src/Trapdoor.tsx") so the
    // pre-realpath check would have accepted it; the canonical compare
    // catches the escape and the file is never read.
    const { mkdtemp, mkdir, writeFile, symlink, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const parent = await mkdtemp(join(tmpdir(), 'agent-devtools-symlink-'));
    try {
      const workspace = join(parent, 'workspace');
      const outside = join(parent, 'outside');
      await mkdir(join(workspace, 'src'), { recursive: true });
      await mkdir(outside, { recursive: true });
      await writeFile(join(outside, 'secret.txt'), 'leak\n');
      await symlink(join(outside, 'secret.txt'), join(workspace, 'src', 'Trapdoor.tsx'));
      const { start } = makeStartServerStub();
      const plugin = buildPlugin({ startServer: start });
      const { viteServer, middlewares } = makeFakeViteServer({ workspace });
      await runConfigureServer(plugin, viteServer);
      const { res, body, status, ended } = makeJsonRes();
      const req = {
        method: 'GET',
        url: '/?file=src%2FTrapdoor.tsx&line=1',
        headers: { ...AUTH_HEADERS },
      } as IncomingMessage;
      middlewares[1]!.handler(req, res);
      await ended();
      expect(status()).toBe(403);
      expect(JSON.parse(body())).toEqual({ error: 'file outside workspace root' });
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('honors the workspace option even when it points outside the Vite project root', async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const parent = await mkdtemp(join(tmpdir(), 'agent-devtools-ws-'));
    try {
      const inner = join(parent, 'inner');
      const sibling = join(parent, 'sibling');
      await mkdir(inner, { recursive: true });
      await mkdir(sibling, { recursive: true });
      const file = Array.from({ length: 5 }, (_, i) => `line${String(i + 1)}`).join('\n');
      await writeFile(join(sibling, 'Outside.tsx'), file);
      const { start } = makeStartServerStub();
      const plugin = buildPlugin({ startServer: start, workspace: '..' });
      const { viteServer, middlewares } = makeFakeViteServer({ workspace: inner });
      await runConfigureServer(plugin, viteServer);
      const { res, body, status, ended } = makeJsonRes();
      const req = {
        method: 'GET',
        url: `/?file=${encodeURIComponent('sibling/Outside.tsx')}&line=3`,
        headers: { ...AUTH_HEADERS },
      } as IncomingMessage;
      middlewares[1]!.handler(req, res);
      await ended();
      expect(status()).toBe(200);
      const payload = JSON.parse(body()) as { code: string; startLine: number; endLine: number };
      expect(payload.startLine).toBe(1);
      expect(payload.endLine).toBe(5);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
