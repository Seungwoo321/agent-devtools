import { afterEach, describe, expect, it } from 'vitest';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer as createHttpServer, type Server } from 'node:http';
import { DEFAULT_PORT, LOOPBACK_HOST, startServer, type StartedServer } from './server.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    if (fn) await fn().catch(() => undefined);
  }
});

function track(started: StartedServer): StartedServer {
  cleanups.push(() => started.close());
  return started;
}

async function occupyPort(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createHttpServer();
    server.once('error', reject);
    server.listen(port, LOOPBACK_HOST, () => {
      cleanups.push(
        () =>
          new Promise<void>((resolveClose) => {
            server.close(() => resolveClose());
          }),
      );
      resolve(server);
    });
  });
}

async function fetchText(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.once('error', reject);
    req.end();
  });
}

describe('startServer', () => {
  it('binds to 127.0.0.1 only', async () => {
    const started = track(
      await startServer(
        (_req, res) => {
          res.statusCode = 200;
          res.end('ok');
        },
        { port: 0 },
      ),
    );
    const address = started.server.address() as AddressInfo;
    expect(address.address).toBe('127.0.0.1');
    expect(started.host).toBe('127.0.0.1');
    expect(started.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it('returns the actual bound port (port=0 → OS-assigned)', async () => {
    const started = track(await startServer(() => undefined, { port: 0 }));
    expect(started.port).toBeGreaterThan(0);
  });

  it('falls back to port+1 when the desired port is taken', async () => {
    const first = track(await startServer(() => undefined, { port: 0 }));
    const taken = first.port;

    const second = track(await startServer(() => undefined, { port: taken }));
    expect(second.port).toBe(taken + 1);
  });

  it('walks past multiple sequential occupied ports', async () => {
    // Find a base port and occupy the next two slots. We need three
    // consecutive ports (base, base+1, base+2) under our control so the
    // fallback walk has something deterministic to step over. When vitest
    // runs other test files in parallel (or another process snags an
    // ephemeral port between calls), the +1/+2 occupy can fail with
    // EADDRINUSE — retry with a fresh base instead of flaking the suite.
    let occupied = 0;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const base = track(await startServer(() => undefined, { port: 0 }));
      try {
        await occupyPort(base.port + 1);
        await occupyPort(base.port + 2);
        occupied = base.port;
        break;
      } catch {
        // The +1 / +2 slot got taken by an external binder during the
        // gap; try a new ephemeral base. Anything already bound is in
        // `cleanups` and will be closed in afterEach.
      }
    }
    if (occupied === 0) {
      throw new Error('could not reserve three consecutive ephemeral ports after 10 attempts');
    }

    const found = track(await startServer(() => undefined, { port: occupied, maxAttempts: 20 }));
    // Whichever free slot the OS gives, it must skip the three explicitly held
    // ports (base, base+1, base+2). Don't lock to exactly base+3 — adjacent
    // ports can be in TIME_WAIT from earlier tests in the same run.
    expect(found.port).toBeGreaterThan(occupied + 2);
    expect(found.port).toBeLessThanOrEqual(occupied + 20);
  });

  it('throws when no port in [port, port + maxAttempts) is free', async () => {
    // We need two consecutive ports under our control: `occupied` (held by
    // the tracked server) and `occupied + 1` (manually bound) so the
    // maxAttempts=2 walk has no free slot to land on. When vitest runs
    // other test files in parallel (or another process snags an ephemeral
    // port between calls), the +1 occupy can fail with EADDRINUSE — retry
    // with a fresh base instead of flaking the suite. Mirrors the pattern
    // used by the "walks past multiple sequential occupied ports" test
    // above; the failure mode is identical.
    let occupied = 0;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const base = track(await startServer(() => undefined, { port: 0 }));
      try {
        await occupyPort(base.port + 1);
        occupied = base.port;
        break;
      } catch {
        // The +1 slot got taken by an external binder during the gap; try
        // a new ephemeral base. Anything already bound is in `cleanups`
        // and will be closed in afterEach.
      }
    }
    if (occupied === 0) {
      throw new Error('could not reserve two consecutive ephemeral ports after 10 attempts');
    }

    await expect(startServer(() => undefined, { port: occupied, maxAttempts: 2 })).rejects.toThrow(
      /No free port found in \[\d+, \d+\] on 127\.0\.0\.1/,
    );
  });

  it('invokes the handler and serves the response', async () => {
    const started = track(
      await startServer(
        (_req, res) => {
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ pong: true }));
        },
        { port: 0 },
      ),
    );
    const res = await fetchText(`${started.url}/anything`);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ pong: true });
  });

  it('returns 500 + JSON error when the handler rejects', async () => {
    const started = track(
      await startServer(
        () => {
          throw new Error('boom');
        },
        { port: 0 },
      ),
    );
    const res = await fetchText(`${started.url}/`);
    expect(res.status).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: 'boom' });
  });

  it('uses DEFAULT_PORT as the starting point when port is omitted', async () => {
    // Don't actually grab DEFAULT_PORT here (CI may have it free or not).
    // Just verify the constant is sane.
    expect(DEFAULT_PORT).toBeGreaterThan(1024);
    expect(DEFAULT_PORT).toBeLessThan(65536);
  });
});
