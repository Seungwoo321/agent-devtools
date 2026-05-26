/**
 * Settings persistence. Mirrors the launcher/storage.ts shape: localStorage
 * by default, wrapped in try/catch because localStorage is unavailable
 * under file://, Safari private mode, restrictive iframe sandboxes, and
 * storage-quota-exceeded conditions. A dropped read just falls back to
 * defaults; a dropped write loses the user's most recent toggle, which is
 * acceptable for a dev-only widget.
 *
 * `safeMode` is intentionally NOT included in the persisted payload: the
 * field is in-memory only and must re-default to `true` on every widget
 * mount, so a fresh tab cannot silently inherit a relaxed posture.
 */
import { DEFAULT_SETTINGS, isPermissionMode, isProviderId, type Settings } from './types.js';

export const DEFAULT_SETTINGS_STORAGE_KEY = 'agent-devtools:settings';

export interface SettingsStorageOptions {
  /** Storage backend. Defaults to `globalThis.localStorage`. */
  readonly storage?: Storage | null;
  /** Key used to read/write the settings payload. */
  readonly key?: string;
}

function resolveStorage(options: SettingsStorageOptions): Storage | null {
  if (options.storage !== undefined) return options.storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadSettings(options: SettingsStorageOptions = {}): Settings {
  const storage = resolveStorage(options);
  if (!storage) return DEFAULT_SETTINGS;
  const key = options.key ?? DEFAULT_SETTINGS_STORAGE_KEY;
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (raw === null) return DEFAULT_SETTINGS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SETTINGS;
    const p = parsed as Record<string, unknown>;
    // Field-by-field validation — a corrupt value for one field should not
    // poison the rest; reset only the corrupt one to its default.
    const provider = isProviderId(p.provider) ? p.provider : DEFAULT_SETTINGS.provider;
    const permissionMode = isPermissionMode(p.permissionMode)
      ? p.permissionMode
      : DEFAULT_SETTINGS.permissionMode;
    // `safeMode` is never read from storage — it is mount-scoped state that
    // must always start from the default (`true`). Any value present in the
    // persisted payload is ignored on purpose.
    return { provider, permissionMode, safeMode: DEFAULT_SETTINGS.safeMode };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings, options: SettingsStorageOptions = {}): boolean {
  const storage = resolveStorage(options);
  if (!storage) return false;
  const key = options.key ?? DEFAULT_SETTINGS_STORAGE_KEY;
  try {
    storage.setItem(
      key,
      JSON.stringify({
        provider: settings.provider,
        permissionMode: settings.permissionMode,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearSettings(options: SettingsStorageOptions = {}): void {
  const storage = resolveStorage(options);
  if (!storage) return;
  const key = options.key ?? DEFAULT_SETTINGS_STORAGE_KEY;
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}
