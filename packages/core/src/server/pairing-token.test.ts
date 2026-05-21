/**
 * End-to-end forgery tests for the pairing-token gate. Verifies that the
 * HTTP stack — not just the in-memory `verifyAuthorization` helper —
 * rejects every flavor of forged credential against the sensitive
 * `/v1/agent/stream` route.
 *
 * The unit-level coverage of `verifyAuthorization` lives in `auth.test.ts`;
 * this file proves the gate is actually wired in front of the agent route
 * and that no path slips through (e.g. CORS preflight, scheme variants,
 * length-equal-but-wrong tokens).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request, type RequestOptions } from 'node:http';
import { startAgentDevtoolsServer, type AgentDevtoolsServerHandle } from './bootstrap.js';

const handles: AgentDevtoolsServerHandle[] = [];
const tmpDirs: string[] = [];

afterEach(async () => {
  while (handles.length > 0) {
    const h = handles.pop();
    if (h) await h.close().catch(() => undefined);
  }
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function makeTmpWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'adt-token-'));
  tmpDirs.push(dir);
  return dir;
}

function track<T extends AgentDevtoolsServerHandle>(h: T): T {
  handles.push(h);
  return h;
}

interface HttpResult {
  status: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}

function httpRequest(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts: RequestOptions = {
      method: init.method ?? 'GET',
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: init.headers ?? {},
    };
    const req = request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
          headers: res.headers,
        });
      });
    });
    req.once('error', reject);
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}

const STREAM_PATH = '/v1/agent/stream';
const VALID_JSON_BODY = JSON.stringify({ prompt: 'hi' });

async function startGated(): Promise<AgentDevtoolsServerHandle> {
  return track(
    await startAgentDevtoolsServer({
      workspace: makeTmpWorkspace(),
      port: 0,
      // The auth gate is the unit under test here; pass an empty providers
      // map so the agent-stream route returns 501 (not configured) cleanly
      // instead of spawning a real ACP child process.
      providers: {},
    }),
  );
}

describe('pairing-token gate — forgery resistance on /v1/agent/stream', () => {
  it('rejects requests with no Authorization header (401)', async () => {
    const h = await startGated();
    const r = await httpRequest(`${h.url}${STREAM_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: VALID_JSON_BODY,
    });
    expect(r.status).toBe(401);
  });

  it('advertises Bearer auth via WWW-Authenticate on 401', async () => {
    const h = await startGated();
    const r = await httpRequest(`${h.url}${STREAM_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: VALID_JSON_BODY,
    });
    expect(r.status).toBe(401);
    expect(String(r.headers['www-authenticate'])).toMatch(/Bearer/i);
  });

  it('rejects wrong auth schemes (Basic / Token / ApiKey)', async () => {
    const h = await startGated();
    for (const scheme of ['Basic', 'Token', 'ApiKey']) {
      const r = await httpRequest(`${h.url}${STREAM_PATH}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `${scheme} ${h.pairingToken}`,
        },
        body: VALID_JSON_BODY,
      });
      expect(r.status, `scheme ${scheme}`).toBe(401);
    }
  });

  it('rejects Bearer with an empty token', async () => {
    const h = await startGated();
    const r = await httpRequest(`${h.url}${STREAM_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ',
      },
      body: VALID_JSON_BODY,
    });
    expect(r.status).toBe(401);
  });

  it('rejects a Bearer token from a different process mint (different value, same length)', async () => {
    const h = await startGated();
    // A second handle mints a fresh token of the same length but different value.
    const other = await startGated();
    expect(other.pairingToken).not.toBe(h.pairingToken);
    expect(other.pairingToken.length).toBe(h.pairingToken.length);

    const r = await httpRequest(`${h.url}${STREAM_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${other.pairingToken}`,
      },
      body: VALID_JSON_BODY,
    });
    expect(r.status).toBe(401);
  });

  it('rejects a Bearer token with a single trailing character appended', async () => {
    const h = await startGated();
    const r = await httpRequest(`${h.url}${STREAM_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${h.pairingToken}x`,
      },
      body: VALID_JSON_BODY,
    });
    expect(r.status).toBe(401);
  });

  it('rejects a Bearer token with the leading character flipped', async () => {
    const h = await startGated();
    const first = h.pairingToken[0] ?? 'A';
    const flipped = `${first === 'A' ? 'B' : 'A'}${h.pairingToken.slice(1)}`;
    expect(flipped).not.toBe(h.pairingToken);
    expect(flipped.length).toBe(h.pairingToken.length);
    const r = await httpRequest(`${h.url}${STREAM_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${flipped}`,
      },
      body: VALID_JSON_BODY,
    });
    expect(r.status).toBe(401);
  });

  it('rejects a Bearer with the literal token in the URL but not in the header', async () => {
    const h = await startGated();
    // Confirm the token must travel in the Authorization header, never the URL.
    const r = await httpRequest(`${h.url}${STREAM_PATH}?token=${h.pairingToken}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: VALID_JSON_BODY,
    });
    expect(r.status).toBe(401);
  });

  it('rejects a lowercased "bearer" scheme literal', async () => {
    const h = await startGated();
    const r = await httpRequest(`${h.url}${STREAM_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `bearer ${h.pairingToken}`,
      },
      body: VALID_JSON_BODY,
    });
    expect(r.status).toBe(401);
  });

  it('also gates /health (no anonymous probe surface)', async () => {
    const h = await startGated();
    const r = await httpRequest(`${h.url}/health`);
    expect(r.status).toBe(401);
  });

  it('accepts the correct Bearer token and returns 501 (no agent factory wired)', async () => {
    const h = await startGated();
    const r = await httpRequest(`${h.url}${STREAM_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${h.pairingToken}`,
      },
      body: VALID_JSON_BODY,
    });
    // `startGated` passes an empty providers map, so the gate passes and
    // the route returns 501 ("agent stream not configured"). The point is
    // the request crossed the auth barrier — anything other than 401 here
    // proves the correct token was accepted.
    expect(r.status).toBe(501);
    expect(r.body).toMatch(/agent stream not configured/);
  });
});
