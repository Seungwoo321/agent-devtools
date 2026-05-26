import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS_STORAGE_KEY,
  clearSettings,
  loadSettings,
  saveSettings,
} from './storage.js';
import { DEFAULT_SETTINGS } from './types.js';

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

describe('loadSettings', () => {
  it('returns DEFAULT_SETTINGS when storage is null', () => {
    expect(loadSettings({ storage: null })).toEqual(DEFAULT_SETTINGS);
  });

  it('returns DEFAULT_SETTINGS when the key is unset', () => {
    expect(loadSettings({ storage: makeStorage() })).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips a saved payload', () => {
    const storage = makeStorage();
    saveSettings({ provider: 'sdk', permissionMode: 'plan', safeMode: true }, { storage });
    expect(loadSettings({ storage })).toEqual({
      provider: 'sdk',
      permissionMode: 'plan',
      safeMode: true,
    });
  });

  it('uses a custom key when provided', () => {
    const storage = makeStorage();
    saveSettings(
      { provider: 'sdk', permissionMode: 'plan', safeMode: true },
      { storage, key: 'custom' },
    );
    expect(loadSettings({ storage, key: 'custom' })).toEqual({
      provider: 'sdk',
      permissionMode: 'plan',
      safeMode: true,
    });
    // Defaults under the default key remain untouched.
    expect(loadSettings({ storage })).toEqual(DEFAULT_SETTINGS);
  });

  it('resets only the corrupt field, preserving the rest', () => {
    const storage = makeStorage();
    storage.setItem(
      DEFAULT_SETTINGS_STORAGE_KEY,
      JSON.stringify({ provider: 'mystery', permissionMode: 'plan' }),
    );
    expect(loadSettings({ storage })).toEqual({
      provider: DEFAULT_SETTINGS.provider,
      permissionMode: 'plan',
      safeMode: true,
    });
  });

  it('falls back to defaults when the payload is not JSON', () => {
    const storage = makeStorage();
    storage.setItem(DEFAULT_SETTINGS_STORAGE_KEY, '{not json');
    expect(loadSettings({ storage })).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults when the payload is JSON but not an object', () => {
    const storage = makeStorage();
    storage.setItem(DEFAULT_SETTINGS_STORAGE_KEY, JSON.stringify('hello'));
    expect(loadSettings({ storage })).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults when reading throws', () => {
    expect(loadSettings({ storage: throwingStorage('read') })).toEqual(DEFAULT_SETTINGS);
  });
});

describe('saveSettings', () => {
  it('returns false when no storage is available', () => {
    expect(saveSettings(DEFAULT_SETTINGS, { storage: null })).toBe(false);
  });

  it('returns true on success', () => {
    expect(saveSettings(DEFAULT_SETTINGS, { storage: makeStorage() })).toBe(true);
  });

  it('returns false when the underlying setItem throws (quota / disabled)', () => {
    expect(saveSettings(DEFAULT_SETTINGS, { storage: throwingStorage('write') })).toBe(false);
  });
});

describe('clearSettings', () => {
  it('removes the stored payload so the next load is default', () => {
    const storage = makeStorage();
    saveSettings({ provider: 'sdk', permissionMode: 'plan', safeMode: true }, { storage });
    clearSettings({ storage });
    expect(loadSettings({ storage })).toEqual(DEFAULT_SETTINGS);
  });

  it('is a noop when storage is null', () => {
    expect(() => clearSettings({ storage: null })).not.toThrow();
  });

  it('swallows removeItem exceptions', () => {
    expect(() => clearSettings({ storage: throwingStorage('remove') })).not.toThrow();
  });
});
