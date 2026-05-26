/**
 * Position persistence for the floating launcher. We only stash one record
 * per origin (storageKey defaults to a single namespaced key); the launcher
 * itself decides how to clamp the loaded value against the live viewport
 * before applying it.
 *
 * All access is wrapped in try/catch because `localStorage` is unavailable
 * under file:// protocols, Safari private mode, restrictive iframe sandboxes,
 * and storage-quota-exceeded conditions. Persistence is best-effort — a
 * dropped save just resets the launcher to the default on next reload.
 */
import type { LauncherPosition } from './state.js';

export const DEFAULT_LAUNCHER_STORAGE_KEY = 'agent-devtools:launcher:position';

export interface LauncherStorageOptions {
  /** Storage backend. Defaults to `globalThis.localStorage`. */
  readonly storage?: Storage | null;
  /** Key used to read/write the position payload. */
  readonly key?: string;
}

interface StoredPayload {
  readonly x: number;
  readonly y: number;
}

function resolveStorage(options: LauncherStorageOptions): Storage | null {
  if (options.storage !== undefined) return options.storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isValidPayload(value: unknown): value is StoredPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { x?: unknown; y?: unknown };
  return Number.isFinite(v.x) && Number.isFinite(v.y);
}

export function loadLauncherPosition(
  options: LauncherStorageOptions = {},
): LauncherPosition | null {
  const storage = resolveStorage(options);
  if (!storage) return null;
  const key = options.key ?? DEFAULT_LAUNCHER_STORAGE_KEY;
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidPayload(parsed)) return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

export function saveLauncherPosition(
  position: LauncherPosition,
  options: LauncherStorageOptions = {},
): boolean {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return false;
  const storage = resolveStorage(options);
  if (!storage) return false;
  const key = options.key ?? DEFAULT_LAUNCHER_STORAGE_KEY;
  try {
    storage.setItem(key, JSON.stringify({ x: position.x, y: position.y }));
    return true;
  } catch {
    return false;
  }
}

export function clearLauncherPosition(options: LauncherStorageOptions = {}): void {
  const storage = resolveStorage(options);
  if (!storage) return;
  const key = options.key ?? DEFAULT_LAUNCHER_STORAGE_KEY;
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}
