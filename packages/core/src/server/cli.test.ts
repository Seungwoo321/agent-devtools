import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCliArgs, runCli } from './cli.js';
import { DEFAULT_PORT, PORT_FALLBACK_ATTEMPTS, type StartedServer } from './server.js';

const cleanups: Array<() => Promise<void>> = [];
const tmpDirs: string[] = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    if (fn) await fn().catch(() => undefined);
  }
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function makeTmpWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-devtools-cli-'));
  tmpDirs.push(dir);
  return dir;
}

function track(started: StartedServer | undefined): StartedServer | undefined {
  if (started) cleanups.push(() => started.close());
  return started;
}

function fakeIo(): {
  io: { stdout: (line: string) => void; stderr: (line: string) => void };
  out: string[];
  err: string[];
} {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      stdout: (line) => out.push(line),
      stderr: (line) => err.push(line),
    },
    out,
    err,
  };
}

async function getJson(
  url: string,
  options: { token?: string } = {},
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const headers = options.token ? { authorization: `Bearer ${options.token}` } : undefined;
    const req = request(url, headers ? { headers } : {}, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
        resolve({ status: res.statusCode ?? 0, body: parsed });
      });
    });
    req.once('error', reject);
    req.end();
  });
}

describe('parseCliArgs', () => {
  it('returns defaults when no args are given', () => {
    expect(parseCliArgs([])).toEqual({
      port: DEFAULT_PORT,
      maxAttempts: PORT_FALLBACK_ATTEMPTS,
      workspace: process.cwd(),
      help: false,
    });
  });

  it('parses --port and --max-attempts', () => {
    expect(parseCliArgs(['--port', '5000', '--max-attempts', '5'])).toEqual({
      port: 5000,
      maxAttempts: 5,
      workspace: process.cwd(),
      help: false,
    });
  });

  it('parses --workspace', () => {
    expect(parseCliArgs(['--workspace', '/tmp/anywhere']).workspace).toBe('/tmp/anywhere');
  });

  it('reports missing value for --workspace', () => {
    expect(() => parseCliArgs(['--workspace'])).toThrow(/Missing value for --workspace/);
  });

  it('parses -h and --help', () => {
    expect(parseCliArgs(['--help']).help).toBe(true);
    expect(parseCliArgs(['-h']).help).toBe(true);
  });

  it('rejects unknown flags', () => {
    expect(() => parseCliArgs(['--bogus'])).toThrow(/Unknown argument: --bogus/);
  });

  it('rejects --port out of range', () => {
    expect(() => parseCliArgs(['--port', '-1'])).toThrow(/Invalid --port/);
    expect(() => parseCliArgs(['--port', '70000'])).toThrow(/Invalid --port/);
  });

  it('accepts --port 0 (OS-assigned port)', () => {
    expect(parseCliArgs(['--port', '0']).port).toBe(0);
  });

  it('rejects non-numeric --port', () => {
    expect(() => parseCliArgs(['--port', 'abc'])).toThrow(/Invalid value for --port: abc/);
  });

  it('rejects --max-attempts < 1', () => {
    expect(() => parseCliArgs(['--max-attempts', '0'])).toThrow(/Invalid --max-attempts/);
  });

  it('reports missing values for value-taking flags', () => {
    expect(() => parseCliArgs(['--port'])).toThrow(/Missing value for --port/);
    expect(() => parseCliArgs(['--max-attempts'])).toThrow(/Missing value for --max-attempts/);
  });
});

describe('runCli', () => {
  it('prints help with exit code 0 when --help is given', async () => {
    const { io, out } = fakeIo();
    const result = await runCli(['--help'], io);
    expect(result.exitCode).toBe(0);
    expect(result.started).toBeUndefined();
    expect(out.join('')).toMatch(/agent-devtools/);
  });

  it('returns exit code 2 and prints help to stderr on parse failure', async () => {
    const { io, err } = fakeIo();
    const result = await runCli(['--bogus'], io);
    expect(result.exitCode).toBe(2);
    expect(err.join('')).toMatch(/Unknown argument: --bogus/);
    expect(err.join('')).toMatch(/Usage:/);
  });

  it('binds to 127.0.0.1 on the requested port and serves /health with the pairing token', async () => {
    const { io, out } = fakeIo();
    const ws = makeTmpWorkspace();
    const result = await runCli(['--port', '0', '--workspace', ws], io);
    track(result.started);
    expect(result.exitCode).toBe(0);
    const started = result.started;
    if (!started) throw new Error('expected started server');
    expect(started.host).toBe('127.0.0.1');
    expect(out.join('')).toMatch(/listening on http:\/\/127\.0\.0\.1:\d+/);

    const token = result.pairingToken;
    if (!token) throw new Error('expected pairing token');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(out.join('')).toContain(`pairing token: ${token}`);

    const health = await getJson(`${started.url}/health`, { token });
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ ok: true });
  });

  it('returns 401 when the pairing token is missing or wrong', async () => {
    const { io } = fakeIo();
    const ws = makeTmpWorkspace();
    const result = await runCli(['--port', '0', '--workspace', ws], io);
    track(result.started);
    const started = result.started;
    if (!started) throw new Error('expected started server');

    const missing = await getJson(`${started.url}/health`);
    expect(missing.status).toBe(401);
    expect(missing.body).toEqual({ error: 'unauthorized' });

    const wrong = await getJson(`${started.url}/health`, { token: 'not-the-real-token' });
    expect(wrong.status).toBe(401);
  });

  it('returns 404 JSON for unknown paths when the token is valid', async () => {
    const { io } = fakeIo();
    const ws = makeTmpWorkspace();
    const result = await runCli(['--port', '0', '--workspace', ws], io);
    track(result.started);
    const started = result.started;
    const token = result.pairingToken;
    if (!started || !token) throw new Error('expected started server + token');
    const res = await getJson(`${started.url}/nope`, { token });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not found' });
  });

  it('rotates the pairing token on each runCli invocation', async () => {
    const wsA = makeTmpWorkspace();
    const wsB = makeTmpWorkspace();
    const a = await runCli(['--port', '0', '--workspace', wsA], fakeIo().io);
    track(a.started);
    const b = await runCli(['--port', '0', '--workspace', wsB], fakeIo().io);
    track(b.started);
    expect(a.pairingToken).toBeDefined();
    expect(b.pairingToken).toBeDefined();
    expect(a.pairingToken).not.toBe(b.pairingToken);
  });

  it('exposes the resolved workspace and prints its canonical root', async () => {
    const { io, out } = fakeIo();
    const ws = makeTmpWorkspace();
    const result = await runCli(['--port', '0', '--workspace', ws], io);
    track(result.started);
    expect(result.workspace).toBeDefined();
    expect(result.workspace?.root).toBeTruthy();
    expect(out.join('')).toContain(`workspace: ${result.workspace?.root ?? ''}`);
  });

  it('returns exit code 2 and a clear message when --workspace does not exist', async () => {
    const { io, err } = fakeIo();
    const result = await runCli(
      ['--port', '0', '--workspace', '/this/path/should/not/exist/agent-devtools-test'],
      io,
    );
    expect(result.exitCode).toBe(2);
    expect(result.started).toBeUndefined();
    expect(err.join('')).toMatch(/does not exist/);
  });
});
