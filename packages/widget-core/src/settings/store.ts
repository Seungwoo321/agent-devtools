/**
 * Reactive settings store. The orchestrator, transport and panel all read
 * from this single source of truth; subscribers (panel UI) re-render on
 * change. Every mutation is immediately persisted via `saveSettings` so a
 * page reload doesn't lose the user's last choice.
 *
 * Exception: `safeMode` is in-memory only and re-defaults to `true` every
 * time the store is constructed — see `storage.ts` for the rationale.
 */
import { loadSettings, saveSettings, type SettingsStorageOptions } from './storage.js';
import { DEFAULT_SETTINGS, type Settings } from './types.js';

export interface SettingsStore {
  get(): Settings;
  set(patch: Partial<Settings>): void;
  subscribe(listener: (settings: Settings) => void): () => void;
}

export type CreateSettingsStoreOptions = SettingsStorageOptions;

export function createSettingsStore(options: CreateSettingsStoreOptions = {}): SettingsStore {
  // `loadSettings` deliberately overwrites any persisted `safeMode` with
  // the default, but we re-assert it here so a future change to that
  // helper can never accidentally surface a stored `false`.
  let current: Settings = { ...loadSettings(options), safeMode: DEFAULT_SETTINGS.safeMode };
  const listeners = new Set<(settings: Settings) => void>();

  function emit(): void {
    for (const listener of listeners) listener(current);
  }

  return {
    get(): Settings {
      return current;
    },
    set(patch: Partial<Settings>): void {
      // `safeMode` is a boolean so `??` would treat `false` as "not
      // provided" and fall back to the current value. Use an explicit
      // `undefined` check instead.
      const nextSafeMode = patch.safeMode === undefined ? current.safeMode : patch.safeMode;
      // Reject no-op patches up front so listeners aren't woken for nothing.
      const next: Settings = {
        provider: patch.provider ?? current.provider,
        permissionMode: patch.permissionMode ?? current.permissionMode,
        safeMode: nextSafeMode,
      };
      const providerChanged = next.provider !== current.provider;
      const permissionChanged = next.permissionMode !== current.permissionMode;
      const safeModeChanged = next.safeMode !== current.safeMode;
      if (!providerChanged && !permissionChanged && !safeModeChanged) {
        return;
      }
      current = next;
      // `safeMode` is in-memory only — skip the persistence write when the
      // only change is the safety toggle so storage never carries a stale
      // boolean across mounts.
      if (providerChanged || permissionChanged) {
        saveSettings(current, options);
      }
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
