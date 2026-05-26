/**
 * Default fetch-based SSE transport. Posts the prompt + page context to
 * `${baseUrl}/v1/agent/stream` with a Bearer pairing token, streams the
 * response, and feeds parsed events into the provided `MessageStore`.
 *
 * Design notes:
 *   - The pairing token never leaves the in-process configuration we hand
 *     back to the widget bootstrap; we send it as `Authorization: Bearer`,
 *     not as a URL parameter, so it doesn't end up in browser history.
 *   - The transport contract is "resolves when the stream ends" — abort
 *     causes the promise to resolve quietly (since the orchestrator
 *     already treats aborted signals as non-errors).
 *   - Unknown SSE events are dropped silently; that matches the stream
 *     module's deliberate forward-compat stance (`toStreamEvent` returns
 *     null for unknown event names).
 *   - A stable `clientSessionId` is minted once at construction time and
 *     sent on every request so the server can reuse the same agent
 *     session (the second turn remembers the first). The id is also
 *     persisted to `sessionStorage` so a tab reload reconnects to the
 *     same server-side ACP session — message bubbles already survive
 *     reload via the persisted store, and now the agent's reasoning
 *     context survives with them. The id is tab-scoped (sessionStorage,
 *     not localStorage): a second tab gets its own session so two
 *     conversations don't bleed into each other.
 *   - A fresh `AcpDecoderState` is created per `send()` so each user
 *     turn gets a brand-new assistant text block — without this, every
 *     `text-delta` on the wire would share a constant `blockId` and the
 *     store would render the entire conversation as a single bubble.
 */
import {
  createAcpDecoderState,
  createSSEParserState,
  parseSSEChunk,
  toStreamEvents,
  type MessageStore,
} from '../stream/index.js';
import type { AgentServerInfo, Settings } from '../settings/index.js';
import type { AgentDevtoolsTransport, TransportPayload } from '../orchestrator/index.js';
import type { HandoffRequester, HandoffResult } from '../handoff/index.js';

export interface CreateDefaultTransportOptions {
  /** Base URL of the agent-devtools server (e.g. `http://127.0.0.1:4317`). */
  readonly baseUrl: string;
  /** Pairing token for the `Authorization: Bearer …` header. */
  readonly pairingToken: string;
  /** Override `globalThis.fetch` (tests). */
  readonly fetch?: typeof fetch;
  /**
   * Override the `clientSessionId` minter. Defaults to
   * `crypto.randomUUID()`. Tests substitute a deterministic value.
   */
  readonly generateSessionId?: () => string;
  /**
   * Storage backend for persisting the `clientSessionId` so a tab reload
   * reconnects to the same server-side ACP session. Defaults to
   * `globalThis.sessionStorage`. Pass `null` to disable persistence
   * (every transport instance mints a fresh id — useful in tests and
   * non-browser contexts).
   */
  readonly sessionIdStorage?: Storage | null;
  /** Storage key for the persisted `clientSessionId`. Defaults to `agent-devtools:clientSessionId`. */
  readonly sessionIdStorageKey?: string;
  /**
   * Pull the current widget settings at request time. Each call must return
   * the live snapshot — typically `store.get()` from the SettingsStore — so
   * a toggle made before pressing Send takes effect on the very next turn.
   * Omitted in non-widget contexts (curl, scripts), in which case the
   * server falls back to its own defaults.
   */
  readonly getSettings?: () => Settings;
  /**
   * Milliseconds of complete reader silence before the transport aborts
   * the stream and rejects with a `StreamSilentError`. The server emits a
   * `: keepalive` SSE comment every 20s while the iterable is silent, so a
   * watchdog of 60s is generous: any silence past that point means the
   * stream is genuinely dead (network drop, server crash, half-open
   * connection) rather than just slow model thinking. Default `60_000`.
   * Pass `0` to disable the watchdog (useful in scripted contexts that
   * legitimately wait minutes for a single event).
   */
  readonly streamSilentMs?: number;
  /**
   * Pre-response fetch retry count. When `fetch()` itself rejects (network
   * error before any Response is returned), the transport retries this
   * many additional times with a small backoff. Once a Response arrives
   * the prompt has reached the server and no retry happens — duplicating
   * the prompt would re-run the LLM. AbortErrors never retry. Default `1`
   * (one retry, i.e. two total attempts). Pass `0` to disable.
   */
  readonly preResponseRetries?: number;
  /**
   * Milliseconds to wait between the failed initial fetch and the retry
   * attempt. Default `300`. Only used when `preResponseRetries > 0`.
   */
  readonly preResponseRetryBackoffMs?: number;
}

const DEFAULT_STREAM_SILENT_MS = 60_000;
const DEFAULT_PRE_RESPONSE_RETRIES = 1;
const DEFAULT_PRE_RESPONSE_RETRY_BACKOFF_MS = 300;

/**
 * Thrown by `pumpStream` when no chunk has arrived for longer than the
 * configured `streamSilentMs`. Surfaces a clear "stream went dead" error
 * to the composer instead of hanging forever on a half-open connection.
 */
export class StreamSilentError extends Error {
  constructor(silenceMs: number) {
    super(`agent stream went silent for ${String(silenceMs)}ms`);
    this.name = 'StreamSilentError';
  }
}

const STREAM_PATH = '/v1/agent/stream';
const SESSION_ID_STORAGE_KEY = 'agent-devtools:clientSessionId';

/**
 * Per-action permission policy attached to the request whenever the
 * header-level "Safe mode" toggle is on. Mirrors the four-category shape
 * the server's ACP runtime expects (`fileEdit | bash | webFetch | mcpTool`)
 * — file edits still run unattended because that's the whole point of an
 * agentic devtool, but every other side-effecting category surfaces a
 * permission prompt.
 */
const SAFE_MODE_PERMISSION_POLICY = Object.freeze({
  fileEdit: 'auto',
  bash: 'ask',
  webFetch: 'ask',
  mcpTool: 'ask',
} as const);

export function createDefaultTransport(
  options: CreateDefaultTransportOptions,
): AgentDevtoolsTransport {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const generate = options.generateSessionId ?? defaultGenerateSessionId;
  const sessionStorage = resolveSessionIdStorage(options.sessionIdStorage);
  const sessionStorageKey = options.sessionIdStorageKey ?? SESSION_ID_STORAGE_KEY;
  const streamSilentMs = options.streamSilentMs ?? DEFAULT_STREAM_SILENT_MS;
  const preResponseRetries = options.preResponseRetries ?? DEFAULT_PRE_RESPONSE_RETRIES;
  const preResponseRetryBackoffMs =
    options.preResponseRetryBackoffMs ?? DEFAULT_PRE_RESPONSE_RETRY_BACKOFF_MS;
  // One session per browser tab. Persisted to sessionStorage so a full
  // reload reconnects to the same server-side ACP session (the server
  // keeps a `clientSessionId → ACP sessionId` map for the dev-server
  // lifetime). A second tab gets a fresh id because sessionStorage is
  // tab-scoped. The id is `let` (not `const`) so `resetSession()` can
  // rotate it — each rotation produces a fresh server-side ACP session
  // on the very next `send()` call.
  let clientSessionId = loadOrMintSessionId(sessionStorage, sessionStorageKey, generate);

  return {
    async send(payload: TransportPayload): Promise<void> {
      const settings = options.getSettings?.();
      const requestInit: RequestInit = {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${options.pairingToken}`,
          accept: 'text/event-stream',
        },
        body: JSON.stringify({
          prompt: payload.text,
          clientSessionId,
          context: {
            picked: payload.picked,
            pageContext: payload.pageContext,
          },
          ...(settings && {
            provider: settings.provider,
            permissionMode: settings.permissionMode,
            // When the header-level "Safe mode" toggle is on, lock the
            // side-effecting categories to `ask` while leaving file edits
            // on auto. When off, omit `permissionPolicy` so the server
            // falls back to whatever the host configured at startup.
            ...(settings.safeMode && { permissionPolicy: SAFE_MODE_PERMISSION_POLICY }),
          }),
        }),
        signal: payload.signal,
      };
      const response = await fetchWithPreResponseRetry(
        fetchImpl,
        `${baseUrl}${STREAM_PATH}`,
        requestInit,
        payload.signal,
        preResponseRetries,
        preResponseRetryBackoffMs,
      );

      if (!response.ok) {
        const detail = await safeReadErrorBody(response);
        throw new Error(
          `agent server responded ${String(response.status)}${detail ? `: ${detail}` : ''}`,
        );
      }
      if (!response.body) {
        throw new Error('agent server returned an empty body');
      }

      await pumpStream(response.body, payload.store, payload.signal, streamSilentMs);
    },
    resetSession(): void {
      // Mint a new id and overwrite the persisted slot in place so the
      // next page load picks up the rotated id instead of the previous
      // conversation's. The server-side runtime will see the new
      // `clientSessionId` on the next `send()` and open a fresh ACP
      // session — equivalent to closing and reopening the tab.
      clientSessionId = generate();
      if (sessionStorage) {
        try {
          sessionStorage.setItem(sessionStorageKey, clientSessionId);
        } catch {
          /* quota / disabled storage — the in-memory rotation still works */
        }
      }
    },
  };
}

function defaultGenerateSessionId(): string {
  return globalThis.crypto.randomUUID();
}

function resolveSessionIdStorage(override: Storage | null | undefined): Storage | null {
  if (override !== undefined) return override;
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    // Some sandboxes throw on `sessionStorage` access (disabled storage,
    // cross-origin iframes). Treat as no-persistence rather than crashing.
    return null;
  }
}

function loadOrMintSessionId(storage: Storage | null, key: string, generate: () => string): string {
  if (storage) {
    try {
      const existing = storage.getItem(key);
      if (existing && existing.length > 0) return existing;
    } catch {
      /* fall through to mint a fresh id */
    }
  }
  const minted = generate();
  if (storage) {
    try {
      storage.setItem(key, minted);
    } catch {
      /* quota / disabled storage — fine, the id still works in-memory */
    }
  }
  return minted;
}

export interface CreateAgentInfoFetcherOptions {
  /** Base URL of the agent-devtools server (e.g. `http://127.0.0.1:4317`). */
  readonly baseUrl: string;
  /** Pairing token for the `Authorization: Bearer …` header. */
  readonly pairingToken: string;
  /** Override `globalThis.fetch` (tests). */
  readonly fetch?: typeof fetch;
}

const INFO_PATH = '/v1/agent/info';

/**
 * Build an `AgentServerInfo` fetcher bound to the agent-devtools server.
 *
 * Returns a function the settings panel calls once on mount to read the
 * workspace root + registered providers + server-side defaults. Returns
 * `null` on any failure (network, non-OK response, bad JSON) so the panel
 * just falls back to "(not configured)" instead of throwing — the widget
 * stays usable even when the dev server is offline.
 */
export function createAgentInfoFetcher(
  options: CreateAgentInfoFetcherOptions,
): () => Promise<AgentServerInfo | null> {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);

  return async function fetchAgentInfo(): Promise<AgentServerInfo | null> {
    try {
      const response = await fetchImpl(`${baseUrl}${INFO_PATH}`, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${options.pairingToken}`,
          accept: 'application/json',
        },
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as unknown;
      if (!payload || typeof payload !== 'object') return null;
      return payload as AgentServerInfo;
    } catch {
      return null;
    }
  };
}

export interface CreateRelatedImportsFetcherOptions {
  /** Base URL of the agent-devtools server (e.g. `http://127.0.0.1:4317`). */
  readonly baseUrl: string;
  /** Pairing token for the `Authorization: Bearer …` header. */
  readonly pairingToken: string;
  /** Override `globalThis.fetch` (tests). */
  readonly fetch?: typeof fetch;
}

const RELATED_IMPORTS_PATH = '/related-imports';

export type RelatedImportsFetcher = (
  file: string,
  signal?: AbortSignal,
) => Promise<readonly string[]>;

/**
 * Build a fetcher for the dev server's "what does this file import"
 * endpoint. Hits `${baseUrl}/related-imports?file=<workspace-path>` with
 * the pairing token in the `Authorization: Bearer …` header. Returns the
 * deduped workspace-relative import list on success, an empty array on
 * any failure (network, non-OK, malformed payload). Non-fatal: the agent
 * still has the picked evidence without the dependency shortcut.
 *
 * The dev server (Vite plugin) decides how to compute the list — usually
 * by walking `ViteDevServer.moduleGraph`. The widget contract is just
 * "ask, take what you get, ship the rest."
 */
export function createRelatedImportsFetcher(
  options: CreateRelatedImportsFetcherOptions,
): RelatedImportsFetcher {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);

  return async function fetchRelatedImports(
    file: string,
    signal?: AbortSignal,
  ): Promise<readonly string[]> {
    if (!file) return [];
    const url = `${baseUrl}${RELATED_IMPORTS_PATH}?file=${encodeURIComponent(file)}`;
    try {
      const init: RequestInit = {
        method: 'GET',
        headers: {
          authorization: `Bearer ${options.pairingToken}`,
          accept: 'application/json',
        },
      };
      if (signal) init.signal = signal;
      const response = await fetchImpl(url, init);
      if (!response.ok) return [];
      const payload = (await response.json()) as { imports?: unknown };
      if (!Array.isArray(payload.imports)) return [];
      const imports: string[] = [];
      for (const entry of payload.imports) {
        if (typeof entry === 'string' && entry.length > 0) imports.push(entry);
      }
      return imports;
    } catch {
      return [];
    }
  };
}

export interface CreateSourceSliceFetcherOptions {
  /** Base URL of the agent-devtools server (e.g. `http://127.0.0.1:4317`). */
  readonly baseUrl: string;
  /** Pairing token for the `Authorization: Bearer …` header. */
  readonly pairingToken: string;
  /** Override `globalThis.fetch` (tests). */
  readonly fetch?: typeof fetch;
}

const SOURCE_SLICE_PATH = '/source-slice';

export interface SourceSlicePayload {
  readonly code: string;
  readonly startLine: number;
  readonly endLine: number;
}

export type SourceSliceFetcher = (
  file: string,
  line: number,
  signal?: AbortSignal,
) => Promise<SourceSlicePayload | null>;

/**
 * Build a fetcher for the dev server's "show me the source around this
 * line" endpoint. Hits `${baseUrl}/source-slice?file=<workspace-path>&line=<n>`
 * with the pairing token in the `Authorization: Bearer …` header.
 * Returns the slice payload on success, `null` on any failure (network,
 * non-OK, malformed payload). Non-fatal: the agent still has the picked
 * evidence without the surrounding code.
 *
 * The dev server (Vite plugin) decides the window — typically ten lines
 * on each side of the picked line, clamped to the file boundaries. The
 * widget contract is just "ask, take what you get, ship the rest."
 */
export function createSourceSliceFetcher(
  options: CreateSourceSliceFetcherOptions,
): SourceSliceFetcher {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);

  return async function fetchSourceSlice(
    file: string,
    line: number,
    signal?: AbortSignal,
  ): Promise<SourceSlicePayload | null> {
    if (!file || !Number.isFinite(line) || line < 1) return null;
    const url = `${baseUrl}${SOURCE_SLICE_PATH}?file=${encodeURIComponent(file)}&line=${encodeURIComponent(String(Math.floor(line)))}`;
    try {
      const init: RequestInit = {
        method: 'GET',
        headers: {
          authorization: `Bearer ${options.pairingToken}`,
          accept: 'application/json',
        },
      };
      if (signal) init.signal = signal;
      const response = await fetchImpl(url, init);
      if (!response.ok) return null;
      const payload = (await response.json()) as {
        code?: unknown;
        startLine?: unknown;
        endLine?: unknown;
      };
      if (
        typeof payload.code !== 'string' ||
        typeof payload.startLine !== 'number' ||
        typeof payload.endLine !== 'number' ||
        payload.startLine < 1 ||
        payload.endLine < payload.startLine
      ) {
        return null;
      }
      return {
        code: payload.code,
        startLine: payload.startLine,
        endLine: payload.endLine,
      };
    } catch {
      return null;
    }
  };
}

export interface CreateHandoffRequesterOptions {
  /** Base URL of the agent-devtools server (e.g. `http://127.0.0.1:4317`). */
  readonly baseUrl: string;
  /** Pairing token for the `Authorization: Bearer …` header. */
  readonly pairingToken: string;
  /** Override `globalThis.fetch` (tests). */
  readonly fetch?: typeof fetch;
}

const HANDOFF_PATH = '/v1/agent/handoff';

/**
 * Build a function that POSTs a `HandoffRequest` to `/v1/agent/handoff`
 * with the pairing token in the `Authorization: Bearer …` header and
 * returns the server's `{ file, command }` artifact.
 *
 * The pairing token is sent as a header, never in the URL, so it doesn't
 * leak into the browser history or referer header. The endpoint is
 * idempotent from the widget's perspective — each call writes a fresh
 * `/tmp/agent-devtools-handoff-<uuid>.md` so a retry won't clobber a
 * file the user was still copying from.
 */
export function createHandoffRequester(options: CreateHandoffRequesterOptions): HandoffRequester {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);

  return async function requestHandoff(request): Promise<HandoffResult> {
    const body: Record<string, unknown> = {
      conversation: request.conversation,
    };
    if (request.picked !== undefined && request.picked !== null) {
      body.picked = request.picked;
    }
    if (request.pageContext !== undefined && request.pageContext !== null) {
      body.pageContext = request.pageContext;
    }
    if (request.permissionMode !== undefined) {
      body.permissionMode = request.permissionMode;
    }
    const init: RequestInit = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${options.pairingToken}`,
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    };
    if (request.signal) init.signal = request.signal;

    const response = await fetchImpl(`${baseUrl}${HANDOFF_PATH}`, init);
    if (!response.ok) {
      const detail = await safeReadErrorBody(response);
      throw new Error(
        `agent server responded ${String(response.status)}${detail ? `: ${detail}` : ''}`,
      );
    }
    const parsed = (await response.json()) as { file?: unknown; command?: unknown };
    if (typeof parsed.file !== 'string' || typeof parsed.command !== 'string') {
      throw new Error('agent server returned a malformed handoff artifact');
    }
    return { file: parsed.file, command: parsed.command };
  };
}

async function pumpStream(
  body: ReadableStream<Uint8Array>,
  store: MessageStore,
  signal: AbortSignal,
  streamSilentMs: number,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSSEParserState();
  const acpState = createAcpDecoderState();
  // Wake a blocked `reader.read()` when the caller aborts so we don't sit on
  // a half-open stream past the abort.
  const onAbort = (): void => {
    void reader.cancel().catch(() => undefined);
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener('abort', onAbort, { once: true });
  try {
    while (true) {
      if (signal.aborted) return;
      const { value, done } = await readWithWatchdog(reader, streamSilentMs);
      // Re-check after the await: a chunk that was already in flight when
      // abort fired must not be folded into the store. Caller-driven abort
      // wins over the watchdog timeout — only throw `StreamSilentError`
      // when the silence was not caused by an external abort.
      if (signal.aborted) return;
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const raw of parseSSEChunk(parser, chunk)) {
        for (const event of toStreamEvents(acpState, raw)) {
          store.applyEvent(event);
        }
      }
    }
    // Flush any trailing buffer (rare — most servers terminate with \n\n).
    const tail = decoder.decode();
    if (tail) {
      for (const raw of parseSSEChunk(parser, tail)) {
        for (const event of toStreamEvents(acpState, raw)) {
          store.applyEvent(event);
        }
      }
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    try {
      reader.releaseLock();
    } catch {
      /* nothing to release if the reader was already closed */
    }
  }
}

/**
 * Wrap `reader.read()` with a silence watchdog. If no chunk arrives within
 * `streamSilentMs` the reader is cancelled and a `StreamSilentError` is
 * thrown. `streamSilentMs <= 0` disables the watchdog (pass-through). The
 * server's `: keepalive` heartbeats arrive as chunks here even though they
 * decode to zero parsed events, so the watchdog resets on heartbeats as
 * well as real data — exactly what we want.
 */
async function readWithWatchdog(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  streamSilentMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (streamSilentMs <= 0) return reader.read();
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timerId = setTimeout(() => {
      reject(new StreamSilentError(streamSilentMs));
    }, streamSilentMs);
  });
  try {
    return await Promise.race([reader.read(), timeout]);
  } catch (error) {
    if (error instanceof StreamSilentError) {
      await reader.cancel().catch(() => undefined);
    }
    throw error;
  } finally {
    if (timerId !== undefined) clearTimeout(timerId);
  }
}

/**
 * Retry the initial fetch when it rejects with a network error before any
 * Response arrives — that means the request never reached the server, so
 * a retry is idempotent. Once a Response is received the prompt has hit
 * the server and the LLM has likely started; retrying then would
 * duplicate work. Abort errors are never retried.
 */
async function fetchWithPreResponseRetry(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  retries: number,
  backoffMs: number,
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    try {
      return await fetchImpl(url, init);
    } catch (error) {
      if (isAbortError(error) || signal.aborted) throw error;
      if (attempt >= retries) throw error;
      attempt += 1;
      if (backoffMs > 0) {
        await waitOrAbort(backoffMs, signal);
        if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      }
    }
  }
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  return false;
}

function waitOrAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function safeReadErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    const trimmed = text.trim();
    if (trimmed.length === 0) return '';
    // Server emits JSON errors; surface .error if present, otherwise raw.
    try {
      const parsed = JSON.parse(trimmed) as { error?: unknown };
      if (typeof parsed.error === 'string') return parsed.error;
    } catch {
      /* not JSON — fall through */
    }
    return trimmed;
  } catch {
    return '';
  }
}
