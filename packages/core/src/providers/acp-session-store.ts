/**
 * On-disk persistence for `(cwd, clientSessionId) → acpSessionId` mappings.
 *
 * Why disk: the ACP runtime keeps this mapping in-memory inside the
 * dev-server process. When the Vite dev-server restarts (the developer
 * edits config, or HMR can't recover, or a crash) the in-memory map dies
 * with it — but the browser tab still has its `clientSessionId` cookie and
 * its rendered message bubbles. Without persistence, the very next prompt
 * mints a fresh ACP session and the agent loses every previous turn of
 * context even though the user can still see the conversation. With
 * persistence, the runtime calls `loadSession` against the stored ACP
 * `sessionId` on first hit after restart, restoring continuity.
 *
 * Why JSON file: trivial to inspect, no native deps, survives crashes if
 * we write atomically. The expected size is a handful of entries per
 * developer machine — durability matters, throughput does not.
 *
 * Storage shape is keyed by `cwd` first so a multi-workspace dev session
 * doesn't pile every project's sessions into one flat namespace, and a
 * future "prune one workspace" operation is a single key delete.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Persistent store for `(cwd, clientSessionId) → acpSessionId`. All
 * methods are best-effort: read/write errors are swallowed so a broken
 * store file can never prevent the runtime from minting a fresh session.
 */
export interface AcpSessionStore {
  /** Lookup. Returns undefined when missing, malformed, or on I/O error. */
  get(cwd: string, clientSessionId: string): Promise<string | undefined>;
  /** Upsert. Silently drops on write error (never throws). */
  set(cwd: string, clientSessionId: string, acpSessionId: string): Promise<void>;
  /** Remove one entry. Silently drops on error. */
  delete(cwd: string, clientSessionId: string): Promise<void>;
}

export interface CreateDefaultAcpSessionStoreOptions {
  /**
   * Override the file path. Useful for tests; production callers omit and
   * accept `~/.agent-devtools/acp-sessions.json`.
   */
  filePath?: string;
}

const STORE_VERSION = 1;
const DEFAULT_REL_PATH = ['.agent-devtools', 'acp-sessions.json'] as const;

interface StoreEntryValue {
  acpSessionId: string;
  updatedAt: string;
}

interface StoreShape {
  version: 1;
  entries: Record<string, Record<string, StoreEntryValue>>;
}

export function createDefaultAcpSessionStore(
  options: CreateDefaultAcpSessionStoreOptions = {},
): AcpSessionStore {
  const filePath = options.filePath ?? join(homedir(), ...DEFAULT_REL_PATH);

  // Chain a Promise lock so back-to-back `set()`/`delete()` calls can't
  // race on the read-modify-write cycle. The lock only serializes writes;
  // reads always go straight to disk.
  let writeChain: Promise<void> = Promise.resolve();

  const enqueueWrite = (task: () => Promise<void>): Promise<void> => {
    const next = writeChain.then(task, task);
    // Don't let a single failed task poison the chain — swallow rejections
    // for the chain itself while still surfacing them to the caller.
    writeChain = next.catch(() => undefined);
    return next;
  };

  async function readStore(): Promise<StoreShape> {
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (error) {
      if (isEnoent(error)) return emptyStore();
      // Any other read error: behave as if the file did not exist. Logging
      // here is intentionally one-line so it shows up in dev-server stderr
      // without spamming.
      process.stderr.write(
        `[acp-session-store] dropping malformed store: ${errorMessage(error)}\n`,
      );
      return emptyStore();
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return normalize(parsed);
    } catch (error) {
      process.stderr.write(
        `[acp-session-store] dropping malformed store: ${errorMessage(error)}\n`,
      );
      return emptyStore();
    }
  }

  async function writeStore(store: StoreShape): Promise<void> {
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
    const tmp = `${filePath}.tmp`;
    // Atomic write: stage to a sibling tmp file and rename in. If the
    // process dies mid-write, the on-disk file is either the previous
    // good copy or the brand-new one — never a half-written blob.
    await writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
    await rename(tmp, filePath);
  }

  return {
    async get(cwd, clientSessionId) {
      const store = await readStore();
      return store.entries[cwd]?.[clientSessionId]?.acpSessionId;
    },

    set(cwd, clientSessionId, acpSessionId) {
      return enqueueWrite(async () => {
        try {
          const store = await readStore();
          const byCwd = store.entries[cwd] ?? {};
          byCwd[clientSessionId] = {
            acpSessionId,
            updatedAt: new Date().toISOString(),
          };
          store.entries[cwd] = byCwd;
          await writeStore(store);
        } catch (error) {
          process.stderr.write(`[acp-session-store] set failed: ${errorMessage(error)}\n`);
        }
      });
    },

    delete(cwd, clientSessionId) {
      return enqueueWrite(async () => {
        try {
          const store = await readStore();
          const byCwd = store.entries[cwd];
          if (!byCwd) return;
          if (!(clientSessionId in byCwd)) return;
          delete byCwd[clientSessionId];
          if (Object.keys(byCwd).length === 0) delete store.entries[cwd];
          await writeStore(store);
        } catch (error) {
          process.stderr.write(`[acp-session-store] delete failed: ${errorMessage(error)}\n`);
        }
      });
    },
  };
}

function emptyStore(): StoreShape {
  return { version: STORE_VERSION, entries: {} };
}

/**
 * Validate the parsed JSON has the expected shape and coerce to
 * {@link StoreShape}. Anything off-spec → empty store (the caller has
 * already logged when JSON.parse failed; we only log here for *structural*
 * problems that imply a foreign writer touched the file).
 */
function normalize(parsed: unknown): StoreShape {
  if (parsed === null || typeof parsed !== 'object') {
    process.stderr.write('[acp-session-store] dropping malformed store: root is not an object\n');
    return emptyStore();
  }
  const root = parsed as Record<string, unknown>;
  if (root['version'] !== STORE_VERSION) {
    process.stderr.write(
      `[acp-session-store] dropping malformed store: version ${String(root['version'])} != ${STORE_VERSION}\n`,
    );
    return emptyStore();
  }
  const entries = root['entries'];
  if (entries === null || typeof entries !== 'object') {
    process.stderr.write(
      '[acp-session-store] dropping malformed store: entries is not an object\n',
    );
    return emptyStore();
  }

  const out: StoreShape = { version: STORE_VERSION, entries: {} };
  for (const [cwd, byCwd] of Object.entries(entries as Record<string, unknown>)) {
    if (byCwd === null || typeof byCwd !== 'object') continue;
    const normalizedByCwd: Record<string, StoreEntryValue> = {};
    for (const [clientSessionId, value] of Object.entries(byCwd as Record<string, unknown>)) {
      if (value === null || typeof value !== 'object') continue;
      const v = value as Record<string, unknown>;
      const acpSessionId = v['acpSessionId'];
      const updatedAt = v['updatedAt'];
      if (typeof acpSessionId !== 'string' || acpSessionId.length === 0) continue;
      normalizedByCwd[clientSessionId] = {
        acpSessionId,
        updatedAt: typeof updatedAt === 'string' ? updatedAt : new Date(0).toISOString(),
      };
    }
    if (Object.keys(normalizedByCwd).length > 0) {
      out.entries[cwd] = normalizedByCwd;
    }
  }
  return out;
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
