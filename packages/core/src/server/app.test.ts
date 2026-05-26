import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request, type IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AgentStreamFactory, type PermissionMode, type ProviderId } from './app.js';
import type { PermissionPolicy } from '../providers/acp.js';
import type { AcpSessionStore } from '../providers/acp-session-store.js';
import type {
  HandoffArtifact,
  HandoffRequestPayload,
  WriteHandoffArtifactOptions,
} from './handoff.js';
import { createWorkspace, type FileTools, type Workspace } from '../files/index.js';
import { startServer, type StartedServer } from './server.js';

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

function makeTmpWorkspace(): Workspace {
  const dir = mkdtempSync(join(tmpdir(), 'agent-devtools-app-'));
  tmpDirs.push(dir);
  return createWorkspace(dir);
}

async function startApp(
  factory?: AgentStreamFactory,
  options: {
    maxBodyBytes?: number;
    pairingToken?: string;
    workspace?: Workspace;
    providers?: Partial<Record<ProviderId, AgentStreamFactory>>;
    defaultProvider?: ProviderId;
    defaultPermissionMode?: PermissionMode;
    defaultPermissionPolicy?: PermissionPolicy;
    writeHandoffArtifact?: (
      payload: HandoffRequestPayload,
      options: WriteHandoffArtifactOptions,
    ) => Promise<HandoffArtifact>;
    acpSessionStore?: AcpSessionStore;
  } = {},
): Promise<StartedServer> {
  // For backwards-compatible test ergonomics: a single `factory` registers
  // under the default provider id ('acp') unless an explicit `providers` map
  // is supplied.
  const providers = options.providers ?? (factory ? { acp: factory } : undefined);
  const handler = createApp({
    ...(providers && { providers }),
    ...(options.defaultProvider && { defaultProvider: options.defaultProvider }),
    ...(options.defaultPermissionMode && { defaultPermissionMode: options.defaultPermissionMode }),
    ...(options.defaultPermissionPolicy && {
      defaultPermissionPolicy: options.defaultPermissionPolicy,
    }),
    ...(options.maxBodyBytes !== undefined && { maxBodyBytes: options.maxBodyBytes }),
    ...(options.pairingToken !== undefined && { pairingToken: options.pairingToken }),
    ...(options.workspace !== undefined && { workspace: options.workspace }),
    ...(options.writeHandoffArtifact !== undefined && {
      writeHandoffArtifact: options.writeHandoffArtifact,
    }),
    ...(options.acpSessionStore !== undefined && {
      acpSessionStore: options.acpSessionStore,
    }),
  });
  const started = await startServer(handler, { port: 0 });
  cleanups.push(() => started.close());
  return started;
}

function authHeaders(token: string | undefined): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

interface JsonResponse {
  status: number;
  body: unknown;
}

async function getJson(url: string, options: { token?: string } = {}): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { method: 'GET', headers: { ...authHeaders(options.token) } },
      (res) => {
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
      },
    );
    req.once('error', reject);
    req.end();
  });
}

async function postJson(
  url: string,
  body: unknown,
  options: { token?: string } = {},
): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const req = request(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders(options.token) },
      },
      (res) => {
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
      },
    );
    req.once('error', reject);
    req.write(payload);
    req.end();
  });
}

function postStream(
  url: string,
  body: unknown,
  options: { token?: string } = {},
): { events: Promise<string[]>; abort: () => void; readResponse: Promise<IncomingMessage> } {
  let abortFn = (): void => undefined;
  const readResponse = new Promise<IncomingMessage>((resolveResponse, reject) => {
    const req = request(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders(options.token) },
      },
      (res) => resolveResponse(res),
    );
    abortFn = () => req.destroy();
    req.once('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });

  const events = readResponse.then(
    (res) =>
      new Promise<string[]>((resolveEvents, reject) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const parts = text.split(/\n\n/).filter((p) => p.length > 0);
          resolveEvents(parts);
        });
        res.once('error', reject);
      }),
  );

  return { events, abort: () => abortFn(), readResponse };
}

describe('createApp', () => {
  it('GET /health returns 200 ok', async () => {
    const app = await startApp();
    const res = await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const req = request(`${app.url}/health`, (httpRes) => {
        const chunks: Buffer[] = [];
        httpRes.on('data', (chunk: Buffer) => chunks.push(chunk));
        httpRes.on('end', () =>
          resolve({
            status: httpRes.statusCode ?? 0,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
          }),
        );
      });
      req.once('error', reject);
      req.end();
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  describe('GET /v1/agent/info', () => {
    it('returns the workspace root, registered providers, and defaults', async () => {
      const workspace = makeTmpWorkspace();
      const factory: AgentStreamFactory = async function* () {
        yield 'noop';
      };
      const app = await startApp(undefined, {
        workspace,
        providers: { acp: factory, sdk: factory },
        defaultProvider: 'sdk',
        defaultPermissionMode: 'plan',
      });
      const res = await getJson(`${app.url}/v1/agent/info`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        workspaceRoot: workspace.root,
        providers: ['acp', 'sdk'],
        defaultProvider: 'sdk',
        defaultPermissionMode: 'plan',
      });
    });

    it('reports workspaceRoot as null when no workspace is configured', async () => {
      const app = await startApp();
      const res = await getJson(`${app.url}/v1/agent/info`);
      expect(res.status).toBe(200);
      const body = res.body as { workspaceRoot: unknown; providers: unknown };
      expect(body.workspaceRoot).toBeNull();
      expect(body.providers).toEqual([]);
    });

    it('omits unregistered provider ids from the providers list', async () => {
      const factory: AgentStreamFactory = async function* () {
        yield 'noop';
      };
      // Only `acp` is registered — `sdk` must NOT appear in the response.
      const app = await startApp(factory);
      const res = await getJson(`${app.url}/v1/agent/info`);
      const body = res.body as { providers: ProviderId[] };
      expect(body.providers).toEqual(['acp']);
    });

    it('is gated by the pairing token when one is configured', async () => {
      const TOKEN = 'pairing-token-fixture-0123456789';
      const app = await startApp(undefined, { pairingToken: TOKEN });
      const denied = await getJson(`${app.url}/v1/agent/info`);
      expect(denied.status).toBe(401);
      const ok = await getJson(`${app.url}/v1/agent/info`, { token: TOKEN });
      expect(ok.status).toBe(200);
    });

    it('surfaces defaultPermissionPolicy when configured so the widget mounts in sync', async () => {
      const policy: PermissionPolicy = {
        fileEdit: 'auto',
        bash: 'ask',
        webFetch: 'ask',
        mcpTool: 'ask',
      };
      const app = await startApp(undefined, { defaultPermissionPolicy: policy });
      const res = await getJson(`${app.url}/v1/agent/info`);
      expect(res.status).toBe(200);
      expect(
        (res.body as { defaultPermissionPolicy: PermissionPolicy }).defaultPermissionPolicy,
      ).toEqual(policy);
    });

    it('omits defaultPermissionPolicy when none is configured (provider falls back to its safe default)', async () => {
      const app = await startApp();
      const res = await getJson(`${app.url}/v1/agent/info`);
      expect(res.status).toBe(200);
      expect((res.body as Record<string, unknown>).defaultPermissionPolicy).toBeUndefined();
    });
  });

  it('unknown route returns 404 JSON', async () => {
    const app = await startApp();
    const res = await postJson(`${app.url}/v1/anything-else`, {});
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not found' });
  });

  it('POST /v1/agent/stream without an injected factory returns 501', async () => {
    const app = await startApp();
    const res = await postJson(`${app.url}/v1/agent/stream`, { prompt: 'x' });
    expect(res.status).toBe(501);
    expect(res.body).toEqual({ error: 'agent stream not configured' });
  });

  it('POST /v1/agent/stream rejects missing prompt with 400', async () => {
    const app = await startApp(async function* () {
      yield 'should not run';
    });
    const res = await postJson(`${app.url}/v1/agent/stream`, {});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'prompt is required' });
  });

  it('POST /v1/agent/stream rejects invalid JSON with 400', async () => {
    const app = await startApp(async function* () {
      yield 1;
    });
    const res = await postJson(`${app.url}/v1/agent/stream`, '{not json');
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/not valid JSON/);
  });

  it('POST /v1/agent/stream rejects oversize payload with 413', async () => {
    const app = await startApp(
      async function* () {
        yield 1;
      },
      { maxBodyBytes: 16 },
    );
    const res = await postJson(`${app.url}/v1/agent/stream`, {
      prompt: 'this prompt is longer than sixteen bytes',
    });
    expect(res.status).toBe(413);
    expect((res.body as { error: string }).error).toMatch(/exceeds/);
  });

  it('POST /v1/agent/stream streams factory output as SSE events', async () => {
    const seenRequests: Array<{ prompt: string }> = [];
    const factory: AgentStreamFactory = async function* (req) {
      seenRequests.push({ prompt: req.prompt });
      yield { type: 'progress', step: 'analyze' };
      yield { type: 'progress', step: 'generate' };
      yield { type: 'complete', code: 'final' };
    };
    const app = await startApp(factory);
    const { events, readResponse } = postStream(`${app.url}/v1/agent/stream`, {
      prompt: 'a button',
    });
    const res = await readResponse;
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const frames = await events;
    expect(frames).toHaveLength(3);
    expect(frames[0]).toContain('event: message');
    expect(frames[0]).toContain('"step":"analyze"');
    expect(frames[2]).toContain('"code":"final"');
    expect(seenRequests).toEqual([{ prompt: 'a button' }]);
  });

  it('passes a request-scoped AbortSignal to the factory and aborts on client disconnect', async () => {
    let receivedSignal: AbortSignal | undefined;
    let cancelledByGenerator = false;
    const factory: AgentStreamFactory = async function* (_req, opts) {
      receivedSignal = opts.signal;
      try {
        for (let i = 0; i < 100; i += 1) {
          yield { i };
          await new Promise((r) => setTimeout(r, 10));
        }
      } finally {
        cancelledByGenerator = true;
      }
    };
    const app = await startApp(factory);
    const { abort, readResponse, events } = postStream(`${app.url}/v1/agent/stream`, {
      prompt: 'x',
    });
    await readResponse;
    await new Promise((r) => setTimeout(r, 20));
    abort();
    await events.catch(() => undefined);
    await new Promise((r) => setTimeout(r, 30));
    expect(receivedSignal).toBeDefined();
    expect(receivedSignal?.aborted).toBe(true);
    expect(cancelledByGenerator).toBe(true);
  });

  describe('with pairingToken', () => {
    const TOKEN = 'pairing-token-fixture-0123456789';

    it('rejects requests with no Authorization header (401)', async () => {
      const app = await startApp(undefined, { pairingToken: TOKEN });
      const res = await postJson(`${app.url}/v1/agent/stream`, { prompt: 'x' });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'unauthorized' });
    });

    it('rejects requests with the wrong token (401)', async () => {
      const app = await startApp(undefined, { pairingToken: TOKEN });
      const res = await postJson(
        `${app.url}/v1/agent/stream`,
        { prompt: 'x' },
        { token: 'wrong-token-xxxxxxxxxxxxxxxxxx' },
      );
      expect(res.status).toBe(401);
    });

    it('rejects requests with the wrong scheme (401)', async () => {
      const app = await startApp(undefined, { pairingToken: TOKEN });
      const res = await new Promise<JsonResponse>((resolve, reject) => {
        const req = request(
          `${app.url}/health`,
          { method: 'GET', headers: { authorization: `Basic ${TOKEN}` } },
          (httpRes) => {
            const chunks: Buffer[] = [];
            httpRes.on('data', (chunk: Buffer) => chunks.push(chunk));
            httpRes.on('end', () =>
              resolve({
                status: httpRes.statusCode ?? 0,
                body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
              }),
            );
          },
        );
        req.once('error', reject);
        req.end();
      });
      expect(res.status).toBe(401);
    });

    it('gates /health (loopback is not a security boundary)', async () => {
      const app = await startApp(undefined, { pairingToken: TOKEN });
      const missing = await postJson(`${app.url}/health`, '');
      expect(missing.status).toBe(401);
    });

    it('emits WWW-Authenticate: Bearer on 401', async () => {
      const app = await startApp(undefined, { pairingToken: TOKEN });
      const wwwAuth = await new Promise<string | undefined>((resolve, reject) => {
        const req = request(`${app.url}/health`, (res) => {
          res.resume();
          res.on('end', () => {
            const header = res.headers['www-authenticate'];
            resolve(Array.isArray(header) ? header[0] : header);
          });
        });
        req.once('error', reject);
        req.end();
      });
      expect(wwwAuth).toMatch(/^Bearer/);
    });

    it('passes the gate and streams SSE when the token is correct', async () => {
      const factory: AgentStreamFactory = async function* () {
        yield { type: 'progress', step: 'analyze' };
        yield { type: 'complete', code: 'final' };
      };
      const app = await startApp(factory, { pairingToken: TOKEN });
      const { events, readResponse } = postStream(
        `${app.url}/v1/agent/stream`,
        { prompt: 'a button' },
        { token: TOKEN },
      );
      const res = await readResponse;
      expect(res.statusCode).toBe(200);
      const frames = await events;
      expect(frames).toHaveLength(2);
      expect(frames[1]).toContain('"code":"final"');
    });
  });

  describe('with workspace', () => {
    it('passes workspace + FileTools to the factory and the tools enforce the boundary', async () => {
      const workspace = makeTmpWorkspace();
      writeFileSync(join(workspace.root, 'note.txt'), 'agent-readable', 'utf8');

      let receivedWorkspace: Workspace | undefined;
      let receivedFiles: FileTools | undefined;
      const factory: AgentStreamFactory = async function* (_req, ctx) {
        receivedWorkspace = ctx.workspace;
        receivedFiles = ctx.files;
        yield { type: 'complete' };
      };

      const app = await startApp(factory, { workspace });
      const { events, readResponse } = postStream(`${app.url}/v1/agent/stream`, {
        prompt: 'x',
      });
      await readResponse;
      await events;

      expect(receivedWorkspace).toBeDefined();
      expect(receivedWorkspace?.root).toBe(workspace.root);
      expect(receivedFiles).toBeDefined();

      // FileTools actually work + still enforce the boundary.
      await expect(receivedFiles?.readFile('note.txt')).resolves.toBe('agent-readable');
      await expect(receivedFiles?.readFile('../escape.txt')).rejects.toThrow(/outside workspace/);
    });

    it('omits workspace + files from the factory context when no workspace is configured', async () => {
      let sawWorkspace: Workspace | undefined;
      let sawFiles: FileTools | undefined;
      const factory: AgentStreamFactory = async function* (_req, ctx) {
        sawWorkspace = ctx.workspace;
        sawFiles = ctx.files;
        yield { type: 'complete' };
      };
      const app = await startApp(factory);
      const { events, readResponse } = postStream(`${app.url}/v1/agent/stream`, {
        prompt: 'x',
      });
      await readResponse;
      await events;
      expect(sawWorkspace).toBeUndefined();
      expect(sawFiles).toBeUndefined();
    });
  });

  describe('provider routing', () => {
    it('routes to the requested provider when both are registered', async () => {
      const calls: ProviderId[] = [];
      const acp: AgentStreamFactory = async function* () {
        calls.push('acp');
        yield { from: 'acp' };
      };
      const sdk: AgentStreamFactory = async function* () {
        calls.push('sdk');
        yield { from: 'sdk' };
      };
      const app = await startApp(undefined, { providers: { acp, sdk } });

      const sdkStream = postStream(`${app.url}/v1/agent/stream`, { prompt: 'x', provider: 'sdk' });
      await sdkStream.readResponse;
      const sdkFrames = await sdkStream.events;
      expect(sdkFrames[0]).toContain('"from":"sdk"');

      const acpStream = postStream(`${app.url}/v1/agent/stream`, { prompt: 'x', provider: 'acp' });
      await acpStream.readResponse;
      const acpFrames = await acpStream.events;
      expect(acpFrames[0]).toContain('"from":"acp"');

      expect(calls).toEqual(['sdk', 'acp']);
    });

    it('routes to defaultProvider when the request omits provider', async () => {
      const calls: ProviderId[] = [];
      const acp: AgentStreamFactory = async function* () {
        calls.push('acp');
        yield { from: 'acp' };
      };
      const sdk: AgentStreamFactory = async function* () {
        calls.push('sdk');
        yield { from: 'sdk' };
      };
      const app = await startApp(undefined, {
        providers: { acp, sdk },
        defaultProvider: 'sdk',
      });
      const { events, readResponse } = postStream(`${app.url}/v1/agent/stream`, {
        prompt: 'x',
      });
      await readResponse;
      const frames = await events;
      expect(calls).toEqual(['sdk']);
      expect(frames[0]).toContain('"from":"sdk"');
    });

    it('returns 422 when the request asks for an unknown provider id', async () => {
      const factory: AgentStreamFactory = async function* () {
        yield 'unreachable';
      };
      const app = await startApp(factory);
      const res = await postJson(`${app.url}/v1/agent/stream`, {
        prompt: 'x',
        provider: 'totally-bogus',
      });
      expect(res.status).toBe(422);
      expect((res.body as { error: string }).error).toMatch(/unsupported provider/);
    });

    it('returns 422 when the requested provider is valid but not registered', async () => {
      // factory registered only under 'acp' (default); request asks for 'sdk'.
      const factory: AgentStreamFactory = async function* () {
        yield 'unreachable';
      };
      const app = await startApp(factory);
      const res = await postJson(`${app.url}/v1/agent/stream`, {
        prompt: 'x',
        provider: 'sdk',
      });
      expect(res.status).toBe(422);
      expect((res.body as { error: string }).error).toMatch(/provider not registered: sdk/);
    });
  });

  describe('permissionMode routing', () => {
    it('forwards a valid permissionMode to the factory context', async () => {
      let seen: PermissionMode | undefined;
      const factory: AgentStreamFactory = async function* (_req, ctx) {
        seen = ctx.permissionMode;
        yield { type: 'complete' };
      };
      const app = await startApp(factory);
      const { events, readResponse } = postStream(`${app.url}/v1/agent/stream`, {
        prompt: 'x',
        permissionMode: 'bypassPermissions',
      });
      await readResponse;
      await events;
      expect(seen).toBe('bypassPermissions');
    });

    it("defaults the permissionMode to 'acceptEdits' when omitted", async () => {
      let seen: PermissionMode | undefined;
      const factory: AgentStreamFactory = async function* (_req, ctx) {
        seen = ctx.permissionMode;
        yield { type: 'complete' };
      };
      const app = await startApp(factory);
      const { events, readResponse } = postStream(`${app.url}/v1/agent/stream`, {
        prompt: 'x',
      });
      await readResponse;
      await events;
      expect(seen).toBe('acceptEdits');
    });

    it('honors a configured defaultPermissionMode when the request omits one', async () => {
      let seen: PermissionMode | undefined;
      const factory: AgentStreamFactory = async function* (_req, ctx) {
        seen = ctx.permissionMode;
        yield { type: 'complete' };
      };
      const app = await startApp(factory, { defaultPermissionMode: 'plan' });
      const { events, readResponse } = postStream(`${app.url}/v1/agent/stream`, {
        prompt: 'x',
      });
      await readResponse;
      await events;
      expect(seen).toBe('plan');
    });

    it('returns 422 for an unknown permissionMode', async () => {
      const factory: AgentStreamFactory = async function* () {
        yield 'unreachable';
      };
      const app = await startApp(factory);
      const res = await postJson(`${app.url}/v1/agent/stream`, {
        prompt: 'x',
        permissionMode: 'yolo',
      });
      expect(res.status).toBe(422);
      expect((res.body as { error: string }).error).toMatch(/unsupported permissionMode/);
    });
  });

  describe('permissionPolicy routing', () => {
    const SAFE_POLICY: PermissionPolicy = {
      fileEdit: 'auto',
      bash: 'ask',
      webFetch: 'ask',
      mcpTool: 'ask',
    };
    const OPEN_POLICY: PermissionPolicy = {
      fileEdit: 'auto',
      bash: 'auto',
      webFetch: 'auto',
      mcpTool: 'auto',
    };

    it('forwards a valid permissionPolicy to the factory context', async () => {
      let seen: PermissionPolicy | undefined;
      const factory: AgentStreamFactory = async function* (_req, ctx) {
        seen = ctx.permissionPolicy;
        yield { type: 'complete' };
      };
      const app = await startApp(factory);
      const { events, readResponse } = postStream(`${app.url}/v1/agent/stream`, {
        prompt: 'x',
        permissionPolicy: OPEN_POLICY,
      });
      await readResponse;
      await events;
      expect(seen).toEqual(OPEN_POLICY);
    });

    it('honors defaultPermissionPolicy when the request omits one', async () => {
      let seen: PermissionPolicy | undefined;
      const factory: AgentStreamFactory = async function* (_req, ctx) {
        seen = ctx.permissionPolicy;
        yield { type: 'complete' };
      };
      const app = await startApp(factory, { defaultPermissionPolicy: SAFE_POLICY });
      const { events, readResponse } = postStream(`${app.url}/v1/agent/stream`, {
        prompt: 'x',
      });
      await readResponse;
      await events;
      expect(seen).toEqual(SAFE_POLICY);
    });

    it('leaves permissionPolicy undefined on the context when neither default nor request supplies one', async () => {
      let seen: PermissionPolicy | undefined = SAFE_POLICY;
      const factory: AgentStreamFactory = async function* (_req, ctx) {
        seen = ctx.permissionPolicy;
        yield { type: 'complete' };
      };
      const app = await startApp(factory);
      const { events, readResponse } = postStream(`${app.url}/v1/agent/stream`, {
        prompt: 'x',
      });
      await readResponse;
      await events;
      expect(seen).toBeUndefined();
    });

    it('lets a request-supplied permissionPolicy override the configured default', async () => {
      let seen: PermissionPolicy | undefined;
      const factory: AgentStreamFactory = async function* (_req, ctx) {
        seen = ctx.permissionPolicy;
        yield { type: 'complete' };
      };
      const app = await startApp(factory, { defaultPermissionPolicy: SAFE_POLICY });
      const { events, readResponse } = postStream(`${app.url}/v1/agent/stream`, {
        prompt: 'x',
        permissionPolicy: OPEN_POLICY,
      });
      await readResponse;
      await events;
      expect(seen).toEqual(OPEN_POLICY);
    });

    it('returns 400 when permissionPolicy is not an object', async () => {
      const factory: AgentStreamFactory = async function* () {
        yield 'unreachable';
      };
      const app = await startApp(factory);
      const res = await postJson(`${app.url}/v1/agent/stream`, {
        prompt: 'x',
        permissionPolicy: 'yolo',
      });
      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toMatch(/permissionPolicy must be an object/);
    });

    it('returns 400 when permissionPolicy carries an unknown key', async () => {
      const factory: AgentStreamFactory = async function* () {
        yield 'unreachable';
      };
      const app = await startApp(factory);
      const res = await postJson(`${app.url}/v1/agent/stream`, {
        prompt: 'x',
        permissionPolicy: { ...SAFE_POLICY, webfetch: 'auto' },
      });
      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toMatch(
        /unsupported permissionPolicy key: webfetch/,
      );
    });

    it('returns 400 when permissionPolicy carries an unsupported resolution', async () => {
      const factory: AgentStreamFactory = async function* () {
        yield 'unreachable';
      };
      const app = await startApp(factory);
      const res = await postJson(`${app.url}/v1/agent/stream`, {
        prompt: 'x',
        permissionPolicy: { ...SAFE_POLICY, bash: 'maybe' },
      });
      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toMatch(
        /unsupported permissionPolicy.bash: maybe/,
      );
    });

    it('returns 400 when permissionPolicy is missing a required key', async () => {
      const factory: AgentStreamFactory = async function* () {
        yield 'unreachable';
      };
      const app = await startApp(factory);
      const { mcpTool: _drop, ...partial } = SAFE_POLICY;
      void _drop;
      const res = await postJson(`${app.url}/v1/agent/stream`, {
        prompt: 'x',
        permissionPolicy: partial,
      });
      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toMatch(/permissionPolicy.mcpTool is required/);
    });
  });

  describe('POST /v1/agent/handoff', () => {
    function makeRecorder(): {
      writeHandoffArtifact: (
        payload: HandoffRequestPayload,
        options: WriteHandoffArtifactOptions,
      ) => Promise<HandoffArtifact>;
      calls: Array<{ payload: HandoffRequestPayload; options: WriteHandoffArtifactOptions }>;
    } {
      const calls: Array<{ payload: HandoffRequestPayload; options: WriteHandoffArtifactOptions }> =
        [];
      return {
        calls,
        writeHandoffArtifact: async (payload, options) => {
          calls.push({ payload, options });
          return {
            file: '/tmp/agent-devtools-handoff-fixed.md',
            command: "claude --append-system-prompt-file '/tmp/agent-devtools-handoff-fixed.md'",
          };
        },
      };
    }

    it('returns 200 with the artifact path + shell command for a valid payload', async () => {
      const recorder = makeRecorder();
      const app = await startApp(undefined, {
        writeHandoffArtifact: recorder.writeHandoffArtifact,
      });
      const res = await postJson(`${app.url}/v1/agent/handoff`, {
        conversation: [
          { role: 'user', text: 'fix the button' },
          { role: 'assistant', text: 'Looking at the click handler.' },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        file: '/tmp/agent-devtools-handoff-fixed.md',
        command: "claude --append-system-prompt-file '/tmp/agent-devtools-handoff-fixed.md'",
      });
      expect(recorder.calls).toHaveLength(1);
      expect(recorder.calls[0]!.payload.conversation).toEqual([
        { role: 'user', text: 'fix the button' },
        { role: 'assistant', text: 'Looking at the click handler.' },
      ]);
    });

    it('forwards workspaceRoot + files when a workspace is configured', async () => {
      const recorder = makeRecorder();
      const workspace = makeTmpWorkspace();
      writeFileSync(join(workspace.root, 'pkg.json'), '{}', 'utf8');
      const app = await startApp(undefined, {
        workspace,
        writeHandoffArtifact: recorder.writeHandoffArtifact,
      });
      await postJson(`${app.url}/v1/agent/handoff`, {
        conversation: [{ role: 'user', text: 'hi' }],
      });
      expect(recorder.calls[0]!.options.workspaceRoot).toBe(workspace.root);
      expect(recorder.calls[0]!.options.files).toBeDefined();
      const files = recorder.calls[0]!.options.files as FileTools;
      const read = await files.readFile('pkg.json');
      expect(read).toBe('{}');
    });

    it('omits workspaceRoot + files when no workspace is configured', async () => {
      const recorder = makeRecorder();
      const app = await startApp(undefined, {
        writeHandoffArtifact: recorder.writeHandoffArtifact,
      });
      await postJson(`${app.url}/v1/agent/handoff`, {
        conversation: [{ role: 'user', text: 'hi' }],
      });
      expect(recorder.calls[0]!.options.workspaceRoot).toBeUndefined();
      expect(recorder.calls[0]!.options.files).toBeUndefined();
    });

    it('forwards the picked + pageContext + permissionMode fields verbatim', async () => {
      const recorder = makeRecorder();
      const app = await startApp(undefined, {
        writeHandoffArtifact: recorder.writeHandoffArtifact,
      });
      await postJson(`${app.url}/v1/agent/handoff`, {
        conversation: [],
        picked: { tagName: 'BUTTON', componentName: 'SubmitButton' },
        pageContext: { url: 'http://localhost:5173/checkout' },
        permissionMode: 'bypassPermissions',
      });
      const payload = recorder.calls[0]!.payload;
      expect(payload.picked).toEqual({ tagName: 'BUTTON', componentName: 'SubmitButton' });
      expect(payload.pageContext).toEqual({ url: 'http://localhost:5173/checkout' });
      expect(payload.permissionMode).toBe('bypassPermissions');
    });

    it('falls back to the configured defaultPermissionMode when the body omits one', async () => {
      const recorder = makeRecorder();
      const app = await startApp(undefined, {
        defaultPermissionMode: 'plan',
        writeHandoffArtifact: recorder.writeHandoffArtifact,
      });
      await postJson(`${app.url}/v1/agent/handoff`, { conversation: [] });
      expect(recorder.calls[0]!.payload.permissionMode).toBe('plan');
    });

    it('returns 400 when conversation is missing or not an array', async () => {
      const app = await startApp(undefined, {
        writeHandoffArtifact: makeRecorder().writeHandoffArtifact,
      });
      const res = await postJson(`${app.url}/v1/agent/handoff`, {});
      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toMatch(/conversation/);
    });

    it('returns 400 when a conversation entry has an invalid role', async () => {
      const app = await startApp(undefined, {
        writeHandoffArtifact: makeRecorder().writeHandoffArtifact,
      });
      const res = await postJson(`${app.url}/v1/agent/handoff`, {
        conversation: [{ role: 'system', text: 'nope' }],
      });
      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toMatch(/role/);
    });

    it('returns 400 when a conversation entry text is not a string', async () => {
      const app = await startApp(undefined, {
        writeHandoffArtifact: makeRecorder().writeHandoffArtifact,
      });
      const res = await postJson(`${app.url}/v1/agent/handoff`, {
        conversation: [{ role: 'user', text: 123 }],
      });
      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toMatch(/text/);
    });

    it('returns 400 for an unknown permissionMode in the body', async () => {
      const app = await startApp(undefined, {
        writeHandoffArtifact: makeRecorder().writeHandoffArtifact,
      });
      const res = await postJson(`${app.url}/v1/agent/handoff`, {
        conversation: [],
        permissionMode: 'yolo',
      });
      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toMatch(/permissionMode/);
    });

    it('returns 500 with the underlying message when artifact writing throws', async () => {
      const app = await startApp(undefined, {
        writeHandoffArtifact: async () => {
          throw new Error('disk full');
        },
      });
      const res = await postJson(`${app.url}/v1/agent/handoff`, {
        conversation: [{ role: 'user', text: 'x' }],
      });
      expect(res.status).toBe(500);
      expect((res.body as { error: string }).error).toContain('disk full');
    });

    it('rejects oversize handoff payload with 413', async () => {
      const app = await startApp(undefined, {
        maxBodyBytes: 64,
        writeHandoffArtifact: makeRecorder().writeHandoffArtifact,
      });
      const res = await postJson(`${app.url}/v1/agent/handoff`, {
        conversation: [{ role: 'user', text: 'x'.repeat(200) }],
      });
      expect(res.status).toBe(413);
    });

    it('requires the pairing token when one is configured', async () => {
      const TOKEN = 'tok-xyz';
      const app = await startApp(undefined, {
        pairingToken: TOKEN,
        writeHandoffArtifact: makeRecorder().writeHandoffArtifact,
      });
      const denied = await postJson(`${app.url}/v1/agent/handoff`, {
        conversation: [{ role: 'user', text: 'x' }],
      });
      expect(denied.status).toBe(401);
      const ok = await postJson(
        `${app.url}/v1/agent/handoff`,
        { conversation: [{ role: 'user', text: 'x' }] },
        { token: TOKEN },
      );
      expect(ok.status).toBe(200);
    });

    it('looks up an acpSessionId from the store and forwards it to writeArtifact', async () => {
      const recorder = makeRecorder();
      // Override the recorder to surface a resumeCommand when the
      // route forwards an acpSessionId, so the test exercises the
      // full response shape (including the resumeCommand sibling).
      const captured: Array<{
        payload: HandoffRequestPayload;
        options: WriteHandoffArtifactOptions;
      }> = [];
      const workspace = makeTmpWorkspace();
      const sessionStore = {
        get: async (cwd: string, clientSessionId: string): Promise<string | undefined> => {
          if (cwd === workspace.root && clientSessionId === 'tab-1') return 'acp-XYZ';
          return undefined;
        },
        set: async () => undefined,
        delete: async () => undefined,
      };
      const app = await startApp(undefined, {
        workspace,
        acpSessionStore: sessionStore,
        writeHandoffArtifact: async (payload, options) => {
          captured.push({ payload, options });
          const artifact: HandoffArtifact = {
            file: '/tmp/agent-devtools-handoff-fixed.md',
            command: `cd '${workspace.root}' && claude --append-system-prompt-file '/tmp/agent-devtools-handoff-fixed.md'`,
            ...(options.acpSessionId !== undefined && {
              resumeCommand: `cd '${workspace.root}' && claude --resume '${options.acpSessionId}'`,
            }),
          };
          return artifact;
        },
      });
      const res = await postJson(`${app.url}/v1/agent/handoff`, {
        conversation: [{ role: 'user', text: 'hi' }],
        clientSessionId: 'tab-1',
      });
      expect(res.status).toBe(200);
      expect(captured[0]!.options.acpSessionId).toBe('acp-XYZ');
      const body = res.body as { resumeCommand?: string };
      expect(body.resumeCommand).toBe(`cd '${workspace.root}' && claude --resume 'acp-XYZ'`);
      // Recorder reference satisfies the linter — the real writer is
      // the inline override above.
      void recorder.calls;
    });

    it('omits resumeCommand when the store has no entry for this clientSessionId', async () => {
      const workspace = makeTmpWorkspace();
      const sessionStore = {
        get: async (): Promise<string | undefined> => undefined,
        set: async () => undefined,
        delete: async () => undefined,
      };
      const app = await startApp(undefined, {
        workspace,
        acpSessionStore: sessionStore,
        writeHandoffArtifact: async (_payload, options) => ({
          file: '/tmp/agent-devtools-handoff-fixed.md',
          command: "claude --append-system-prompt-file '/tmp/agent-devtools-handoff-fixed.md'",
          ...(options.acpSessionId !== undefined && {
            resumeCommand: `claude --resume '${options.acpSessionId}'`,
          }),
        }),
      });
      const res = await postJson(`${app.url}/v1/agent/handoff`, {
        conversation: [{ role: 'user', text: 'hi' }],
        clientSessionId: 'tab-unknown',
      });
      expect(res.status).toBe(200);
      const body = res.body as { resumeCommand?: string };
      expect(body.resumeCommand).toBeUndefined();
    });

    it('omits resumeCommand when the body has no clientSessionId', async () => {
      const workspace = makeTmpWorkspace();
      // The store has an entry — but without a clientSessionId on the
      // request the route cannot look it up, so resumeCommand must
      // stay absent.
      const sessionStore = {
        get: async (): Promise<string | undefined> => 'acp-XYZ',
        set: async () => undefined,
        delete: async () => undefined,
      };
      const app = await startApp(undefined, {
        workspace,
        acpSessionStore: sessionStore,
        writeHandoffArtifact: async (_payload, options) => ({
          file: '/tmp/agent-devtools-handoff-fixed.md',
          command: "claude --append-system-prompt-file '/tmp/agent-devtools-handoff-fixed.md'",
          ...(options.acpSessionId !== undefined && {
            resumeCommand: `claude --resume '${options.acpSessionId}'`,
          }),
        }),
      });
      const res = await postJson(`${app.url}/v1/agent/handoff`, {
        conversation: [{ role: 'user', text: 'hi' }],
      });
      expect(res.status).toBe(200);
      const body = res.body as { resumeCommand?: string };
      expect(body.resumeCommand).toBeUndefined();
    });

    it('returns 400 when clientSessionId is the wrong type', async () => {
      const app = await startApp(undefined, {
        writeHandoffArtifact: makeRecorder().writeHandoffArtifact,
      });
      const res = await postJson(`${app.url}/v1/agent/handoff`, {
        conversation: [],
        clientSessionId: 42,
      });
      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toMatch(/clientSessionId/);
    });

    it('swallows session-store get errors and still returns the append command', async () => {
      const workspace = makeTmpWorkspace();
      const sessionStore = {
        get: async (): Promise<string | undefined> => {
          throw new Error('store corrupt');
        },
        set: async () => undefined,
        delete: async () => undefined,
      };
      const app = await startApp(undefined, {
        workspace,
        acpSessionStore: sessionStore,
        writeHandoffArtifact: async (_payload, options) => ({
          file: '/tmp/agent-devtools-handoff-fixed.md',
          command: "claude --append-system-prompt-file '/tmp/agent-devtools-handoff-fixed.md'",
          ...(options.acpSessionId !== undefined && {
            resumeCommand: `claude --resume '${options.acpSessionId}'`,
          }),
        }),
      });
      const res = await postJson(`${app.url}/v1/agent/handoff`, {
        conversation: [{ role: 'user', text: 'hi' }],
        clientSessionId: 'tab-1',
      });
      expect(res.status).toBe(200);
      const body = res.body as { resumeCommand?: string; command: string };
      expect(body.resumeCommand).toBeUndefined();
      expect(body.command).toContain('claude --append-system-prompt-file');
    });
  });
});
