import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMessageStore } from './store.js';
import { DEFAULT_CONVERSATION_STORAGE_KEY, saveMessages } from './storage.js';
import type { MessageItem } from './types.js';

function counterIds(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length(): number {
      return map.size;
    },
    clear(): void {
      map.clear();
    },
    getItem(key: string): string | null {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    key(index: number): string | null {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      map.delete(key);
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
  };
}

// Each test gets its own pristine sessionStorage so persistence under the
// default backend does not leak between tests.
beforeEach(() => {
  try {
    globalThis.sessionStorage?.clear();
  } catch {
    /* environments without sessionStorage are fine */
  }
});

describe('createMessageStore', () => {
  it('appends user messages', () => {
    const store = createMessageStore({ generateId: counterIds(), persist: false });
    const id = store.appendUserMessage('hello');
    expect(id).toBe('id-1');
    expect(store.getItems()).toEqual([{ kind: 'user', id: 'id-1', text: 'hello' }]);
  });

  it('includes pickedSummary when provided', () => {
    const store = createMessageStore({ generateId: counterIds(), persist: false });
    store.appendUserMessage('q', '<Button>');
    expect(store.getItems()[0]).toEqual({
      kind: 'user',
      id: 'id-1',
      text: 'q',
      pickedSummary: '<Button>',
    });
  });

  it('accumulates assistant text deltas by blockId', () => {
    const store = createMessageStore({ generateId: counterIds(), persist: false });
    store.applyEvent({ type: 'text-delta', blockId: 'b1', text: 'Hel' });
    store.applyEvent({ type: 'text-delta', blockId: 'b1', text: 'lo!' });
    expect(store.getItems()).toEqual([
      { kind: 'assistant-text', id: 'id-1', text: 'Hello!', streaming: true },
    ]);
  });

  it('flips streaming false on text-stop', () => {
    const store = createMessageStore({ generateId: counterIds(), persist: false });
    store.applyEvent({ type: 'text-delta', blockId: 'b1', text: 'Done' });
    store.applyEvent({ type: 'text-stop', blockId: 'b1' });
    const item = store.getItems()[0];
    if (!item || item.kind !== 'assistant-text') throw new Error('expected text');
    expect(item.streaming).toBe(false);
  });

  it('creates tool-use entries on tool-use-start and accumulates partial input', () => {
    const store = createMessageStore({ generateId: counterIds(), persist: false });
    store.applyEvent({ type: 'tool-use-start', blockId: 'tu1', name: 'pick' });
    store.applyEvent({ type: 'tool-use-delta', blockId: 'tu1', partialInput: '{"sel' });
    store.applyEvent({ type: 'tool-use-delta', blockId: 'tu1', partialInput: 'ector":"#x"}' });
    store.applyEvent({ type: 'tool-use-stop', blockId: 'tu1' });
    expect(store.getItems()).toEqual([
      {
        kind: 'tool-use',
        id: 'id-1',
        name: 'pick',
        inputPreview: '{"selector":"#x"}',
        streaming: false,
      },
    ]);
  });

  it('appends tool-result and links it to a known tool-use by blockId', () => {
    const store = createMessageStore({ generateId: counterIds(), persist: false });
    store.applyEvent({ type: 'tool-use-start', blockId: 'tu1', name: 'pick' });
    store.applyEvent({ type: 'tool-result', toolUseId: 'tu1', content: 'OK' });
    const result = store.getItems()[1];
    if (!result || result.kind !== 'tool-result') throw new Error('expected tool-result');
    expect(result.content).toBe('OK');
    expect(result.toolUseId).toBe('id-1');
    expect(result.isError).toBe(false);
  });

  it('still appends tool-result when no matching tool-use is known', () => {
    const store = createMessageStore({ generateId: counterIds(), persist: false });
    store.applyEvent({ type: 'tool-result', toolUseId: 'orphan', content: 'X', isError: true });
    expect(store.getItems()).toEqual([
      { kind: 'tool-result', id: 'id-1', toolUseId: 'orphan', content: 'X', isError: true },
    ]);
  });

  it('appends error items', () => {
    const store = createMessageStore({ generateId: counterIds(), persist: false });
    store.applyEvent({ type: 'error', message: 'oops' });
    expect(store.getItems()).toEqual([{ kind: 'error', id: 'id-1', message: 'oops' }]);
  });

  it('done flips remaining streaming items to non-streaming', () => {
    const store = createMessageStore({ generateId: counterIds(), persist: false });
    store.applyEvent({ type: 'text-delta', blockId: 'b1', text: 'hi' });
    store.applyEvent({ type: 'tool-use-start', blockId: 'tu1', name: 'pick' });
    store.applyEvent({ type: 'done' });
    const [text, tool] = store.getItems();
    expect(text?.kind === 'assistant-text' && text.streaming).toBe(false);
    expect(tool?.kind === 'tool-use' && tool.streaming).toBe(false);
  });

  it('notifies subscribers on changes only', () => {
    const store = createMessageStore({ generateId: counterIds(), persist: false });
    const listener = vi.fn();
    store.subscribe(listener);
    store.appendUserMessage('hi');
    expect(listener).toHaveBeenCalledTimes(1);
    store.applyEvent({ type: 'message-start', id: 'm1' });
    expect(listener).toHaveBeenCalledTimes(1);
    store.applyEvent({ type: 'text-delta', blockId: 'b1', text: 'a' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe stops further notifications', () => {
    const store = createMessageStore({ generateId: counterIds(), persist: false });
    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.appendUserMessage('x');
    expect(listener).not.toHaveBeenCalled();
  });

  it('isolates failures in one listener from others', () => {
    const store = createMessageStore({ generateId: counterIds(), persist: false });
    const bad = vi.fn(() => {
      throw new Error('bad');
    });
    const good = vi.fn();
    store.subscribe(bad);
    store.subscribe(good);
    store.appendUserMessage('x');
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('clear empties items and notifies', () => {
    const store = createMessageStore({ generateId: counterIds(), persist: false });
    const listener = vi.fn();
    store.subscribe(listener);
    store.appendUserMessage('x');
    store.clear();
    expect(store.getItems()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('clear is a no-op when already empty', () => {
    const store = createMessageStore({ generateId: counterIds(), persist: false });
    const listener = vi.fn();
    store.subscribe(listener);
    store.clear();
    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores text-delta when the existing item is not assistant-text (defensive)', () => {
    const store = createMessageStore({ generateId: counterIds(), persist: false });
    // Force a collision: tool-use claims blockId 'b1', then a text-delta with same blockId.
    store.applyEvent({ type: 'tool-use-start', blockId: 'b1', name: 'x' });
    const listener = vi.fn();
    store.subscribe(listener);
    store.applyEvent({ type: 'text-delta', blockId: 'b1', text: 'should be ignored' });
    // No new item should appear and no notify should fire.
    expect(store.getItems()).toHaveLength(1);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('createMessageStore — persistence', () => {
  it('rehydrates from storage on creation', () => {
    const storage = makeStorage();
    const seeded: MessageItem[] = [
      { kind: 'user', id: 'u1', text: 'hi' },
      { kind: 'assistant-text', id: 'a1', text: 'hello', streaming: false },
    ];
    saveMessages(seeded, { storage });
    const store = createMessageStore({ generateId: counterIds(), storage });
    expect(store.getItems()).toEqual(seeded);
  });

  it('writes through to storage on every mutation', () => {
    const storage = makeStorage();
    const store = createMessageStore({ generateId: counterIds(), storage });
    store.appendUserMessage('hello');
    const raw = storage.getItem(DEFAULT_CONVERSATION_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as unknown;
    expect(parsed).toEqual([{ kind: 'user', id: 'id-1', text: 'hello' }]);
  });

  it('writes through after assistant text deltas', () => {
    const storage = makeStorage();
    const store = createMessageStore({ generateId: counterIds(), storage });
    store.applyEvent({ type: 'text-delta', blockId: 'b1', text: 'Hello' });
    store.applyEvent({ type: 'text-stop', blockId: 'b1' });
    const parsed = JSON.parse(
      storage.getItem(DEFAULT_CONVERSATION_STORAGE_KEY) as string,
    ) as MessageItem[];
    expect(parsed).toEqual([
      { kind: 'assistant-text', id: 'id-1', text: 'Hello', streaming: false },
    ]);
  });

  it('clear() empties storage too', () => {
    const storage = makeStorage();
    const store = createMessageStore({ generateId: counterIds(), storage });
    store.appendUserMessage('hello');
    store.clear();
    const parsed = JSON.parse(
      storage.getItem(DEFAULT_CONVERSATION_STORAGE_KEY) as string,
    ) as MessageItem[];
    expect(parsed).toEqual([]);
  });

  it('survives a "process restart" — second store reads what the first wrote', () => {
    const storage = makeStorage();
    const first = createMessageStore({ generateId: counterIds(), storage });
    first.appendUserMessage('first turn');
    first.applyEvent({ type: 'text-delta', blockId: 'b1', text: 'reply' });
    first.applyEvent({ type: 'text-stop', blockId: 'b1' });
    // Simulate a full reload: a brand-new store with no shared in-memory state
    // sees what the previous one persisted.
    const second = createMessageStore({ generateId: counterIds(), storage });
    expect(second.getItems()).toEqual([
      { kind: 'user', id: 'id-1', text: 'first turn' },
      { kind: 'assistant-text', id: 'id-2', text: 'reply', streaming: false },
    ]);
  });

  it('persist: false opts out — storage stays empty', () => {
    const storage = makeStorage();
    const store = createMessageStore({
      generateId: counterIds(),
      storage,
      persist: false,
    });
    store.appendUserMessage('not stored');
    expect(storage.getItem(DEFAULT_CONVERSATION_STORAGE_KEY)).toBeNull();
  });

  it('respects a custom storage key', () => {
    const storage = makeStorage();
    const store = createMessageStore({
      generateId: counterIds(),
      storage,
      key: 'agent-devtools:scoped',
    });
    store.appendUserMessage('hi');
    expect(storage.getItem('agent-devtools:scoped')).not.toBeNull();
    expect(storage.getItem(DEFAULT_CONVERSATION_STORAGE_KEY)).toBeNull();
  });
});
