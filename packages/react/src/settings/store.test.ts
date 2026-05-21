import { describe, expect, it, vi } from 'vitest';
import { createSettingsStore } from './store.js';
import { DEFAULT_SETTINGS, type Settings } from './types.js';

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

describe('createSettingsStore', () => {
  it('initializes from DEFAULT_SETTINGS when storage is empty', () => {
    const store = createSettingsStore({ storage: makeStorage() });
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('hydrates from a previously persisted payload', () => {
    const storage = makeStorage();
    storage.setItem(
      'agent-devtools:settings',
      JSON.stringify({ provider: 'sdk', permissionMode: 'plan' }),
    );
    const store = createSettingsStore({ storage });
    expect(store.get()).toEqual({ provider: 'sdk', permissionMode: 'plan' });
  });

  it('applies partial patches and notifies subscribers', () => {
    const store = createSettingsStore({ storage: makeStorage() });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set({ provider: 'sdk' });
    expect(store.get()).toEqual({
      provider: 'sdk',
      permissionMode: DEFAULT_SETTINGS.permissionMode,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(store.get());
    unsubscribe();
  });

  it('persists every successful set to the underlying storage', () => {
    const storage = makeStorage();
    const store = createSettingsStore({ storage });
    store.set({ provider: 'sdk', permissionMode: 'plan' });
    const raw = storage.getItem('agent-devtools:settings');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({
      provider: 'sdk',
      permissionMode: 'plan',
    });
  });

  it('ignores no-op patches (no listener call, no write)', () => {
    const storage = makeStorage();
    const writeSpy = vi.spyOn(storage, 'setItem');
    const store = createSettingsStore({ storage });
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ provider: DEFAULT_SETTINGS.provider });
    store.set({}); // entirely empty patch
    expect(listener).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('unsubscribe stops the listener', () => {
    const store = createSettingsStore({ storage: makeStorage() });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.set({ provider: 'sdk' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('passes a frozen-shape Settings to subscribers (set deep-merges)', () => {
    const store = createSettingsStore({ storage: makeStorage() });
    let seen: Settings | undefined;
    store.subscribe((s) => {
      seen = s;
    });
    store.set({ permissionMode: 'bypassPermissions' });
    expect(seen).toEqual({
      provider: DEFAULT_SETTINGS.provider,
      permissionMode: 'bypassPermissions',
    });
  });
});
