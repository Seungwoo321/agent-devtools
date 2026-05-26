import { describe, expect, it } from 'vitest';
import {
  clearLauncherPosition,
  DEFAULT_LAUNCHER_STORAGE_KEY,
  loadLauncherPosition,
  saveLauncherPosition,
} from './storage.js';

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
      return map.get(key) ?? null;
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

function makeThrowingStorage(): Storage {
  return {
    length: 0,
    clear(): void {
      throw new Error('boom');
    },
    getItem(): string {
      throw new Error('boom');
    },
    key(): string {
      throw new Error('boom');
    },
    removeItem(): void {
      throw new Error('boom');
    },
    setItem(): void {
      throw new Error('boom');
    },
  };
}

describe('launcher storage', () => {
  it('round-trips a position through the default key', () => {
    const storage = makeStorage();
    saveLauncherPosition({ x: 30, y: 40 }, { storage });
    expect(JSON.parse(storage.getItem(DEFAULT_LAUNCHER_STORAGE_KEY) ?? 'null')).toEqual({
      x: 30,
      y: 40,
    });
    expect(loadLauncherPosition({ storage })).toEqual({ x: 30, y: 40 });
  });

  it('honors a custom key', () => {
    const storage = makeStorage();
    saveLauncherPosition({ x: 1, y: 2 }, { storage, key: 'custom' });
    expect(storage.getItem('custom')).not.toBeNull();
    expect(loadLauncherPosition({ storage, key: 'custom' })).toEqual({ x: 1, y: 2 });
  });

  it('returns null when the key is missing', () => {
    const storage = makeStorage();
    expect(loadLauncherPosition({ storage })).toBeNull();
  });

  it('returns null when the stored value is not valid JSON', () => {
    const storage = makeStorage();
    storage.setItem(DEFAULT_LAUNCHER_STORAGE_KEY, 'not-json');
    expect(loadLauncherPosition({ storage })).toBeNull();
  });

  it('returns null when the stored payload is missing fields', () => {
    const storage = makeStorage();
    storage.setItem(DEFAULT_LAUNCHER_STORAGE_KEY, '{"x": 1}');
    expect(loadLauncherPosition({ storage })).toBeNull();
  });

  it('returns null when storage is null', () => {
    expect(loadLauncherPosition({ storage: null })).toBeNull();
  });

  it('refuses to save non-finite positions', () => {
    const storage = makeStorage();
    expect(saveLauncherPosition({ x: Number.NaN, y: 0 }, { storage })).toBe(false);
    expect(saveLauncherPosition({ x: 0, y: Number.POSITIVE_INFINITY }, { storage })).toBe(false);
    expect(storage.getItem(DEFAULT_LAUNCHER_STORAGE_KEY)).toBeNull();
  });

  it('returns false when save throws (quota exceeded, etc.)', () => {
    expect(saveLauncherPosition({ x: 1, y: 2 }, { storage: makeThrowingStorage() })).toBe(false);
  });

  it('returns null when load throws (sandbox)', () => {
    expect(loadLauncherPosition({ storage: makeThrowingStorage() })).toBeNull();
  });

  it('clearLauncherPosition removes the stored value', () => {
    const storage = makeStorage();
    saveLauncherPosition({ x: 1, y: 2 }, { storage });
    clearLauncherPosition({ storage });
    expect(loadLauncherPosition({ storage })).toBeNull();
  });

  it('clearLauncherPosition is silent on throwing storage', () => {
    expect(() => clearLauncherPosition({ storage: makeThrowingStorage() })).not.toThrow();
  });
});
