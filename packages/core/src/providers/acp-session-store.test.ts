import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultAcpSessionStore } from './acp-session-store.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'acp-session-store-'));
}

describe('createDefaultAcpSessionStore', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = makeTmpDir();
    filePath = join(dir, 'store.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns undefined when the file does not exist (ENOENT path)', async () => {
    const store = createDefaultAcpSessionStore({ filePath });
    expect(await store.get('/cwd', 'cs-1')).toBeUndefined();
    // And it should NOT have created the file just for the read.
    expect(existsSync(filePath)).toBe(false);
  });

  it('roundtrips set → get', async () => {
    const store = createDefaultAcpSessionStore({ filePath });
    await store.set('/cwd-a', 'cs-1', 'acp-aaa');
    expect(await store.get('/cwd-a', 'cs-1')).toBe('acp-aaa');
  });

  it('persists across separate store instances at the same file', async () => {
    const writer = createDefaultAcpSessionStore({ filePath });
    await writer.set('/cwd-a', 'cs-1', 'acp-persisted');

    // Brand new instance — must see the same data.
    const reader = createDefaultAcpSessionStore({ filePath });
    expect(await reader.get('/cwd-a', 'cs-1')).toBe('acp-persisted');
  });

  it('returns undefined for an unknown (cwd, clientSessionId)', async () => {
    const store = createDefaultAcpSessionStore({ filePath });
    await store.set('/cwd-a', 'cs-1', 'acp-1');
    expect(await store.get('/cwd-a', 'cs-other')).toBeUndefined();
    expect(await store.get('/cwd-other', 'cs-1')).toBeUndefined();
  });

  it('starts fresh and does not throw when the on-disk file is malformed', async () => {
    writeFileSync(filePath, '{"this is not valid json', 'utf8');
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const store = createDefaultAcpSessionStore({ filePath });
    expect(await store.get('/cwd-a', 'cs-1')).toBeUndefined();
    expect(stderrSpy).toHaveBeenCalled();

    // And we can still write into a fresh state without throwing.
    await store.set('/cwd-a', 'cs-1', 'acp-recovered');
    expect(await store.get('/cwd-a', 'cs-1')).toBe('acp-recovered');
  });

  it('starts fresh when the on-disk shape is wrong (structurally malformed)', async () => {
    writeFileSync(
      filePath,
      JSON.stringify({ version: 99, entries: { x: 'not-an-object' } }),
      'utf8',
    );
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const store = createDefaultAcpSessionStore({ filePath });
    expect(await store.get('/cwd-a', 'cs-1')).toBeUndefined();
    expect(stderrSpy).toHaveBeenCalled();
  });

  it('preserves all concurrent set() writes (no last-writer-wins clobber)', async () => {
    const store = createDefaultAcpSessionStore({ filePath });
    // Fire 8 concurrent writes for distinct keys. A naive read-modify-
    // write implementation would lose some of them because each
    // operation reads the same baseline before any has written. The
    // serialized chain in the store guarantees all 8 land.
    await Promise.all([
      store.set('/cwd-a', 'cs-1', 'a-1'),
      store.set('/cwd-a', 'cs-2', 'a-2'),
      store.set('/cwd-a', 'cs-3', 'a-3'),
      store.set('/cwd-a', 'cs-4', 'a-4'),
      store.set('/cwd-b', 'cs-1', 'b-1'),
      store.set('/cwd-b', 'cs-2', 'b-2'),
      store.set('/cwd-b', 'cs-3', 'b-3'),
      store.set('/cwd-b', 'cs-4', 'b-4'),
    ]);

    expect(await store.get('/cwd-a', 'cs-1')).toBe('a-1');
    expect(await store.get('/cwd-a', 'cs-2')).toBe('a-2');
    expect(await store.get('/cwd-a', 'cs-3')).toBe('a-3');
    expect(await store.get('/cwd-a', 'cs-4')).toBe('a-4');
    expect(await store.get('/cwd-b', 'cs-1')).toBe('b-1');
    expect(await store.get('/cwd-b', 'cs-2')).toBe('b-2');
    expect(await store.get('/cwd-b', 'cs-3')).toBe('b-3');
    expect(await store.get('/cwd-b', 'cs-4')).toBe('b-4');
  });

  it('overwrites the same key on repeated set()', async () => {
    const store = createDefaultAcpSessionStore({ filePath });
    await store.set('/cwd-a', 'cs-1', 'first');
    await store.set('/cwd-a', 'cs-1', 'second');
    expect(await store.get('/cwd-a', 'cs-1')).toBe('second');
  });

  it('delete removes a single entry without touching siblings', async () => {
    const store = createDefaultAcpSessionStore({ filePath });
    await store.set('/cwd-a', 'cs-1', 'a-1');
    await store.set('/cwd-a', 'cs-2', 'a-2');

    await store.delete('/cwd-a', 'cs-1');
    expect(await store.get('/cwd-a', 'cs-1')).toBeUndefined();
    expect(await store.get('/cwd-a', 'cs-2')).toBe('a-2');
  });

  it('delete is a no-op for an unknown key (and does not throw)', async () => {
    const store = createDefaultAcpSessionStore({ filePath });
    await store.set('/cwd-a', 'cs-1', 'a-1');
    await store.delete('/cwd-a', 'never-set');
    await store.delete('/cwd-never-set', 'cs-1');
    expect(await store.get('/cwd-a', 'cs-1')).toBe('a-1');
  });

  it('removes an empty cwd bucket after the last entry is deleted', async () => {
    const store = createDefaultAcpSessionStore({ filePath });
    await store.set('/cwd-a', 'cs-1', 'a-1');
    await store.delete('/cwd-a', 'cs-1');

    // Look at the raw file — the cwd bucket should be gone, not just empty.
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as {
      entries: Record<string, unknown>;
    };
    expect(raw.entries).toEqual({});
  });

  it('honors a custom filePath (does not write to $HOME)', async () => {
    const custom = join(dir, 'nested', 'deep', 'custom.json');
    const store = createDefaultAcpSessionStore({ filePath: custom });
    await store.set('/cwd-a', 'cs-1', 'acp-1');
    // Nested directory must be created and the file lands there.
    expect(existsSync(custom)).toBe(true);
    // Contents are valid JSON of the expected shape.
    const raw = JSON.parse(readFileSync(custom, 'utf8')) as {
      version: number;
      entries: Record<string, Record<string, { acpSessionId: string }>>;
    };
    expect(raw.version).toBe(1);
    expect(raw.entries['/cwd-a']?.['cs-1']?.acpSessionId).toBe('acp-1');
  });

  it('writes via a tmp+rename and does not leave the tmp file behind on success', async () => {
    const store = createDefaultAcpSessionStore({ filePath });
    await store.set('/cwd-a', 'cs-1', 'acp-1');
    expect(existsSync(filePath)).toBe(true);
    expect(existsSync(`${filePath}.tmp`)).toBe(false);
  });
});
