/**
 * Reactive settings store. The orchestrator, transport and panel all read
 * from this single source of truth; subscribers (panel UI) re-render on
 * change. Every mutation is immediately persisted via `saveSettings` so a
 * page reload doesn't lose the user's last choice.
 */
import { loadSettings, saveSettings, type SettingsStorageOptions } from './storage.js';
import type { Settings } from './types.js';

export interface SettingsStore {
  get(): Settings;
  set(patch: Partial<Settings>): void;
  subscribe(listener: (settings: Settings) => void): () => void;
}

export type CreateSettingsStoreOptions = SettingsStorageOptions;

export function createSettingsStore(options: CreateSettingsStoreOptions = {}): SettingsStore {
  let current = loadSettings(options);
  const listeners = new Set<(settings: Settings) => void>();

  function emit(): void {
    for (const listener of listeners) listener(current);
  }

  return {
    get(): Settings {
      return current;
    },
    set(patch: Partial<Settings>): void {
      // Reject no-op patches up front so listeners aren't woken for nothing.
      const next: Settings = {
        provider: patch.provider ?? current.provider,
        permissionMode: patch.permissionMode ?? current.permissionMode,
      };
      if (next.provider === current.provider && next.permissionMode === current.permissionMode) {
        return;
      }
      current = next;
      saveSettings(current, options);
      emit();
    },
    subscribe(listener): () => void {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
  };
}
