import { afterEach, describe, expect, it } from 'vitest';
import { request } from 'node:http';
import { createRouter, type Route, type RouteHandler } from './router.js';
import { startServer, type StartedServer } from './server.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    if (fn) await fn().catch(() => undefined);
  }
});

async function startWithRoutes(
  routes: readonly Route[],
  notFound?: RouteHandler,
): Promise<StartedServer> {
  const handler = createRouter(routes, notFound ? { notFound } : {});
  const started = await startServer(handler, { port: 0 });
  cleanups.push(() => started.close());
  return started;
}

async function fetchText(
  url: string,
  init: { method?: string } = {},
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: init.method ?? 'GET' }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
      );
    });
    req.once('error', reject);
    req.end();
  });
}

describe('createRouter', () => {
  it('dispatches on (method, path) exact match', async () => {
    const app = await startWithRoutes([
      {
        method: 'GET',
        path: '/hi',
        handler: ({ res }) => {
          res.statusCode = 200;
          res.end('hello');
        },
      },
    ]);
    const ok = await fetchText(`${app.url}/hi`);
    expect(ok).toEqual({ status: 200, body: 'hello' });
  });

  it('returns 404 JSON for unmatched routes by default', async () => {
    const app = await startWithRoutes([]);
    const res = await fetchText(`${app.url}/anything`);
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'not found' });
  });

  it('treats method mismatch as 404', async () => {
    const app = await startWithRoutes([
      {
        method: 'POST',
        path: '/x',
        handler: ({ res }) => {
          res.statusCode = 200;
          res.end('ok');
        },
      },
    ]);
    const res = await fetchText(`${app.url}/x`, { method: 'GET' });
    expect(res.status).toBe(404);
  });

  it('honours a custom notFound handler', async () => {
    const app = await startWithRoutes([], ({ res }) => {
      res.statusCode = 418;
      res.setHeader('content-type', 'text/plain');
      res.end('teapot');
    });
    const res = await fetchText(`${app.url}/anywhere`);
    expect(res.status).toBe(418);
    expect(res.body).toBe('teapot');
  });

  it('passes a parsed URL object to the handler', async () => {
    let seenPath = '';
    let seenSearch = '';
    const app = await startWithRoutes([
      {
        method: 'GET',
        path: '/x',
        handler: ({ res, url }) => {
          seenPath = url.pathname;
          seenSearch = url.search;
          res.end();
        },
      },
    ]);
    await fetchText(`${app.url}/x?a=1`);
    expect(seenPath).toBe('/x');
    expect(seenSearch).toBe('?a=1');
  });

  it('signals the handler AbortSignal when the client disconnects', async () => {
    let aborted = false;
    const app = await startWithRoutes([
      {
        method: 'GET',
        path: '/slow',
        handler: ({ res, signal }) => {
          signal.addEventListener('abort', () => {
            aborted = true;
          });
          // Hold the response open; never end.
          res.write('begin');
          return new Promise<void>(() => undefined);
        },
      },
    ]);

    await new Promise<void>((resolve, reject) => {
      const req = request(`${app.url}/slow`, (res) => {
        res.once('data', () => {
          req.destroy();
          resolve();
        });
      });
      req.once('error', () => resolve());
      req.end();
      setTimeout(reject, 1000, new Error('client timeout'));
    });

    await new Promise((r) => setTimeout(r, 30));
    expect(aborted).toBe(true);
  });
});
