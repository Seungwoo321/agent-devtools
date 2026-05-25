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

interface FakeServerSetup {
  readonly close: () => Promise<void>;
  readonly httpServer: EventEmitter;
  readonly viteServer: ViteDevServer;
  readonly middlewares: CapturedMiddleware[];
}

function makeFakeViteServer(opts: { workspace?: string } = {}): FakeServerSetup {
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

  it('without a spawned server, injects a single module script into <head>', () => {
    const result = runTransform(buildPlugin({ spawnServer: false }));
    expect(result).toBeDefined();
    expect(result!.tags).toHaveLength(1);
    const tag = result!.tags[0]!;
    expect(tag.tag).toBe('script');
    expect(tag.attrs).toEqual({ type: 'module' });
    expect(tag.injectTo).toBe('head');
    expect(typeof tag.children).toBe('string');
  });

  it('uses the default importFrom = "@agent-devtools/react"', () => {
    const result = runTransform(buildPlugin({ spawnServer: false }));
    const code = result!.tags[0]!.children!;
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
    const boot = result!.tags[1]!.children!;
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
    // Terminal-handoff requester is bound to the same config so the modal's
    // POST /v1/agent/handoff inherits the same baseUrl + pairing token.
    expect(boot).toContain('createHandoffRequester');
    expect(boot).toContain('__opts.requestHandoff');
    // Idempotent mount guard — a second eval of the bootstrap (e.g. HMR
    // injects a fresh head, or some pathological reload races the module
    // graph) must not stack a second widget on top of the first.
    expect(boot).toContain('__AGENT_DEVTOOLS_MOUNTED__');
  });

  it('emits an idempotent mount guard even on the no-server bootstrap', () => {
    const result = runTransform(buildPlugin({ spawnServer: false }));
    const code = result!.tags[0]!.children!;
    expect(code).toContain('__AGENT_DEVTOOLS_MOUNTED__');
  });

  it('respects a custom importFrom', () => {
    const result = runTransform(
      buildPlugin({ spawnServer: false, importFrom: '@my-org/devtools' }),
    );
    const code = result!.tags[0]!.children!;
    expect(code).toContain('"@my-org/devtools"');
  });

  it('selects the matching adapter when framework is set explicitly (no detection)', async () => {
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start, framework: 'vue' });
    const { viteServer } = makeFakeViteServer({ workspace: '/host/app' });
    await runConfigureServer(plugin, viteServer);
    const result = runTransform(plugin);
    const boot = result!.tags[1]!.children!;
    expect(boot).toContain('"@agent-devtools/vue"');
  });

  it('selects @agent-devtools/vue2 when framework: "vue2"', async () => {
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start, framework: 'vue2' });
    const { viteServer } = makeFakeViteServer({ workspace: '/host/app' });
    await runConfigureServer(plugin, viteServer);
    const result = runTransform(plugin);
    const boot = result!.tags[1]!.children!;
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
    const boot = result!.tags[1]!.children!;
    expect(boot).toContain('"@override/pkg"');
    expect(boot).not.toContain('"@agent-devtools/vue"');
  });

  it('escapes the import specifier safely (JSON-stringified)', () => {
    const result = runTransform(buildPlugin({ spawnServer: false, importFrom: 'a"b' }));
    const code = result!.tags[0]!.children!;
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

  it('after spawn, transformIndexHtml emits a config script then a module bootstrap', async () => {
    const { start } = makeStartServerStub({
      url: 'http://127.0.0.1:4317',
      pairingToken: 'tok-XYZ',
    });
    const plugin = buildPlugin({ startServer: start });
    const { viteServer } = makeFakeViteServer();
    await runConfigureServer(plugin, viteServer);
    const result = runTransform(plugin);
    expect(result).toBeDefined();
    expect(result!.tags).toHaveLength(2);
    const cfg = result!.tags[0]!;
    const boot = result!.tags[1]!;
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
    const cfg = result!.tags[0]!.children!;
    const boot = result!.tags[1]!.children!;
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
    expect(result!.tags).toHaveLength(1);
    expect(result!.tags[0]!.children).not.toContain('createDefaultTransport');
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
    expect(middlewares).toHaveLength(1);
    expect(middlewares[0]!.path).toBe('/__agent_devtools');
  });

  it('installs the proxy middleware even when spawnServer: false (embedder owns upstream)', async () => {
    const { start } = makeStartServerStub();
    const plugin = buildPlugin({ startServer: start, spawnServer: false });
    const { viteServer, middlewares } = makeFakeViteServer();
    await runConfigureServer(plugin, viteServer);
    expect(middlewares).toHaveLength(1);
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
      middlewares[0]!.handler(req, res);

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
    middlewares[0]!.handler(req, res);
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
