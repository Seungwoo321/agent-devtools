import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONVERSATION_STORAGE_KEY,
  clearMessages,
  loadMessages,
  saveMessages,
} from './storage.js';
import type { MessageItem } from './types.js';

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

function throwingStorage(op: 'read' | 'write' | 'remove'): Storage {
  const real = makeStorage();
  return {
    get length(): number {
      return real.length;
    },
    clear(): void {
      real.clear();
    },
    getItem(key: string): string | null {
      if (op === 'read') throw new Error('boom');
      return real.getItem(key);
    },
    key(index: number): string | null {
      return real.key(index);
    },
    removeItem(key: string): void {
      if (op === 'remove') throw new Error('boom');
      real.removeItem(key);
    },
    setItem(key: string, value: string): void {
      if (op === 'write') throw new Error('boom');
      real.setItem(key, value);
    },
  };
}

const SAMPLE: MessageItem[] = [
  { kind: 'user', id: 'u1', text: 'hi' },
  { kind: 'assistant-text', id: 'a1', text: 'hello!', streaming: false },
  {
    kind: 'tool-use',
    id: 't1',
    name: 'pick',
    inputPreview: '{"sel":"#x"}',
    streaming: false,
  },
  {
    kind: 'tool-result',
    id: 'r1',
    toolUseId: 't1',
    content: 'ok',
    isError: false,
  },
  { kind: 'error', id: 'e1', message: 'boom' },
];

describe('loadMessages', () => {
  it('returns [] when storage is null', () => {
    expect(loadMessages({ storage: null })).toEqual([]);
  });

  it('returns [] when the key is unset', () => {
    expect(loadMessages({ storage: makeStorage() })).toEqual([]);
  });

  it('round-trips a saved conversation across all item kinds', () => {
    const storage = makeStorage();
    saveMessages(SAMPLE, { storage });
    expect(loadMessages({ storage })).toEqual(SAMPLE);
  });

  it('strips streaming markers from re-hydrated items so a stale cursor never appears', () => {
    const storage = makeStorage();
    const live: MessageItem[] = [
      { kind: 'assistant-text', id: 'a1', text: 'mid', streaming: true },
      { kind: 'tool-use', id: 't1', name: 'pick', inputPreview: '', streaming: true },
    ];
    saveMessages(live, { storage });
    const restored = loadMessages({ storage });
    const text = restored[0];
    const tool = restored[1];
    if (!text || text.kind !== 'assistant-text') throw new Error('expected assistant-text');
    if (!tool || tool.kind !== 'tool-use') throw new Error('expected tool-use');
    expect(text.streaming).toBe(false);
    expect(tool.streaming).toBe(false);
  });

  it('uses a custom key when provided', () => {
    const storage = makeStorage();
    saveMessages(SAMPLE, { storage, key: 'custom' });
    expect(loadMessages({ storage, key: 'custom' })).toEqual(SAMPLE);
    expect(loadMessages({ storage })).toEqual([]);
  });

  it('drops items with unknown kinds without dropping the conversation', () => {
    const storage = makeStorage();
    storage.setItem(
      DEFAULT_CONVERSATION_STORAGE_KEY,
      JSON.stringify([
        { kind: 'user', id: 'u1', text: 'hi' },
        { kind: 'mystery', id: 'x1', payload: 42 },
        { kind: 'error', id: 'e1', message: 'oops' },
      ]),
    );
    expect(loadMessages({ storage })).toEqual([
      { kind: 'user', id: 'u1', text: 'hi' },
      { kind: 'error', id: 'e1', message: 'oops' },
    ]);
  });

  it('drops items missing required fields rather than poisoning the rest', () => {
    const storage = makeStorage();
    storage.setItem(
      DEFAULT_CONVERSATION_STORAGE_KEY,
      JSON.stringify([
        { kind: 'user', id: 'u1' /* missing text */ },
        { kind: 'user', id: 'u2', text: 'ok' },
      ]),
    );
    expect(loadMessages({ storage })).toEqual([{ kind: 'user', id: 'u2', text: 'ok' }]);
  });

  it('falls back to [] when the payload is not JSON', () => {
    const storage = makeStorage();
    storage.setItem(DEFAULT_CONVERSATION_STORAGE_KEY, '{not json');
    expect(loadMessages({ storage })).toEqual([]);
  });

  it('falls back to [] when the payload is JSON but not an array', () => {
    const storage = makeStorage();
    storage.setItem(DEFAULT_CONVERSATION_STORAGE_KEY, JSON.stringify({ items: [] }));
    expect(loadMessages({ storage })).toEqual([]);
  });

  it('falls back to [] when reading throws', () => {
    expect(loadMessages({ storage: throwingStorage('read') })).toEqual([]);
  });
});

describe('saveMessages', () => {
  it('returns false when no storage is available', () => {
    expect(saveMessages(SAMPLE, { storage: null })).toBe(false);
  });

  it('returns true on success', () => {
    expect(saveMessages(SAMPLE, { storage: makeStorage() })).toBe(true);
  });

  it('returns false when setItem throws (quota / disabled)', () => {
    expect(saveMessages(SAMPLE, { storage: throwingStorage('write') })).toBe(false);
  });

  it('drops the in-memory streaming flag from the serialized payload', () => {
    const storage = makeStorage();
    saveMessages(
      [
        { kind: 'assistant-text', id: 'a1', text: 't', streaming: true },
        { kind: 'tool-use', id: 't1', name: 'n', inputPreview: '', streaming: true },
      ],
      { storage },
    );
    const raw = storage.getItem(DEFAULT_CONVERSATION_STORAGE_KEY) ?? '';
    expect(raw).toContain('"streaming":false');
    expect(raw).not.toContain('"streaming":true');
  });

  it('strips pending placeholders so a reloaded conversation never shows a stale typing indicator', () => {
    const storage = makeStorage();
    saveMessages(
      [
        { kind: 'user', id: 'u1', text: 'hi' },
        { kind: 'assistant-pending', id: 'p1' },
      ],
      { storage },
    );
    const raw = storage.getItem(DEFAULT_CONVERSATION_STORAGE_KEY) ?? '';
    expect(raw).not.toContain('assistant-pending');
    expect(loadMessages({ storage })).toEqual([{ kind: 'user', id: 'u1', text: 'hi' }]);
  });

  it('round-trips the picked evidence payload on user messages', () => {
    const storage = makeStorage();
    const evidence = {
      componentName: 'TodoItem',
      tagName: 'BUTTON',
      selector: 'button.todo-item',
      outerHTML: '<button class="todo-item">Buy milk</button>',
      attributes: { class: 'todo-item', 'data-id': '7' },
      componentChain: [
        {
          componentName: 'TodoItem',
          source: { fileName: 'src/TodoItem.tsx', lineNumber: 23 },
        },
      ],
      source: { fileName: 'src/TodoItem.tsx', lineNumber: 23 },
      boundingRect: { x: 10, y: 20, width: 120, height: 32 },
      propsSnapshot: '{"id":7}',
      relatedImports: ['src/types.ts'],
      sourceSlice: {
        code: 'function TodoItem() {}',
        startLine: 20,
        endLine: 24,
      },
    } as const;
    saveMessages([{ kind: 'user', id: 'u1', text: 'explain', pickedEvidence: evidence }], {
      storage,
    });
    const reloaded = loadMessages({ storage });
    expect(reloaded).toHaveLength(1);
    const first = reloaded[0];
    if (first?.kind !== 'user') throw new Error('expected user item');
    expect(first.pickedEvidence).toEqual(evidence);
  });

  it('drops malformed picked evidence on rehydration without losing the user message', () => {
    const storage = makeStorage();
    storage.setItem(
      DEFAULT_CONVERSATION_STORAGE_KEY,
      JSON.stringify([
        {
          kind: 'user',
          id: 'u1',
          text: 'hi',
          pickedEvidence: { componentName: 42, tagName: null },
        },
      ]),
    );
    expect(loadMessages({ storage })).toEqual([{ kind: 'user', id: 'u1', text: 'hi' }]);
  });
});

describe('clearMessages', () => {
  it('removes the stored payload so the next load is empty', () => {
    const storage = makeStorage();
    saveMessages(SAMPLE, { storage });
    clearMessages({ storage });
    expect(loadMessages({ storage })).toEqual([]);
  });

  it('is a noop when storage is null', () => {
    expect(() => clearMessages({ storage: null })).not.toThrow();
  });

  it('swallows removeItem exceptions', () => {
    expect(() => clearMessages({ storage: throwingStorage('remove') })).not.toThrow();
  });
});
