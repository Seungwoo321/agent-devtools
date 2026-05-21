import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
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
  const dir = mkdtempSync(join(tmpdir(), 'adt-bootstrap-'));
  tmpDirs.push(dir);
  return dir;
}

function track<T extends AgentDevtoolsServerHandle>(h: T): T {
  handles.push(h);
  return h;
}

async function getHealth(url: string, token: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(
      `${url}/health`,
      { headers: { authorization: `Bearer ${token}` } },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    req.once('error', reject);
    req.end();
  });
}

describe('startAgentDevtoolsServer', () => {
  it('starts a loopback server with a fresh pairing token and live workspace', async () => {
    const h = track(await startAgentDevtoolsServer({ workspace: makeTmpWorkspace(), port: 0 }));
    expect(h.url.startsWith('http://127.0.0.1:')).toBe(true);
    expect(h.port).toBeGreaterThan(0);
    expect(h.pairingToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(typeof h.workspace.root).toBe('string');
    expect(h.workspace.root.length).toBeGreaterThan(0);
    const status = await getHealth(h.url, h.pairingToken);
    expect(status).toBe(200);
  });

  it('returns 401 for requests without the pairing token', async () => {
    const h = track(await startAgentDevtoolsServer({ workspace: makeTmpWorkspace(), port: 0 }));
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(`${h.url}/health`, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.once('error', reject);
      req.end();
    });
    expect(status).toBe(401);
  });

  it('mints distinct tokens across separate starts', async () => {
    const a = track(await startAgentDevtoolsServer({ workspace: makeTmpWorkspace(), port: 0 }));
    const b = track(await startAgentDevtoolsServer({ workspace: makeTmpWorkspace(), port: 0 }));
    expect(a.pairingToken).not.toBe(b.pairingToken);
  });

  it('close() shuts the underlying server down', async () => {
    const h = await startAgentDevtoolsServer({ workspace: makeTmpWorkspace(), port: 0 });
    await h.close();
    await expect(getHealth(h.url, h.pairingToken)).rejects.toThrow();
  });

  it('rejects an invalid workspace path', async () => {
    await expect(
      startAgentDevtoolsServer({ workspace: '/this/path/does/not/exist/at/all' }),
    ).rejects.toThrow();
  });
});
