import { describe, expect, it } from 'vitest';
import {
  PANEL_OPEN_STORAGE_KEY,
  WIDGET_VISIBLE_STORAGE_KEY,
  loadPanelOpen,
  loadWidgetVisible,
  savePanelOpen,
  saveWidgetVisible,
} from './visibility-storage.js';

function makeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
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

function throwingStorage(op: 'read' | 'write'): Storage {
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
      real.removeItem(key);
    },
    setItem(key: string, value: string): void {
      if (op === 'write') throw new Error('boom');
      real.setItem(key, value);
    },
  };
}

describe('visibility-storage', () => {
  it('returns null when nothing is stored', () => {
    const storage = makeStorage();
    expect(loadWidgetVisible({ storage })).toBeNull();
    expect(loadPanelOpen({ storage })).toBeNull();
  });

  it('round-trips the widget-visible flag', () => {
    const storage = makeStorage();
    saveWidgetVisible(true, { storage });
    expect(storage.getItem(WIDGET_VISIBLE_STORAGE_KEY)).toBe('true');
    expect(loadWidgetVisible({ storage })).toBe(true);
    saveWidgetVisible(false, { storage });
    expect(loadWidgetVisible({ storage })).toBe(false);
  });

  it('round-trips the panel-open flag under its own key', () => {
    const storage = makeStorage();
    savePanelOpen(true, { storage });
    expect(storage.getItem(PANEL_OPEN_STORAGE_KEY)).toBe('true');
    // The two axes are independent — saving panel-open must not touch the
    // widget-visible key.
    expect(storage.getItem(WIDGET_VISIBLE_STORAGE_KEY)).toBeNull();
    expect(loadPanelOpen({ storage })).toBe(true);
  });

  it('treats a non-canonical stored value as "not stored"', () => {
    const storage = makeStorage({
      [WIDGET_VISIBLE_STORAGE_KEY]: 'garbage',
      [PANEL_OPEN_STORAGE_KEY]: '1',
    });
    expect(loadWidgetVisible({ storage })).toBeNull();
    expect(loadPanelOpen({ storage })).toBeNull();
  });

  it('disables persistence when storage is null', () => {
    expect(loadWidgetVisible({ storage: null })).toBeNull();
    expect(() => saveWidgetVisible(true, { storage: null })).not.toThrow();
    expect(() => savePanelOpen(true, { storage: null })).not.toThrow();
  });

  it('swallows storage exceptions on read and write', () => {
    expect(loadWidgetVisible({ storage: throwingStorage('read') })).toBeNull();
    expect(() => saveWidgetVisible(true, { storage: throwingStorage('write') })).not.toThrow();
  });
});
