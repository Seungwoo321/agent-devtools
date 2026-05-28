/**
 * Visibility persistence for the two on/off axes the orchestrator owns:
 *
 *   - `widgetVisible` — is the whole devtools surface (launcher + composer)
 *     present at all. Flipped by the Ctrl/Cmd+Shift+; hotkey.
 *   - `panelOpen`     — is the chat composer panel open, while the widget is
 *     visible. Flipped by clicking the launcher, the close button, Escape,
 *     or picking an element.
 *
 * Both live here rather than inside the composer because only the
 * orchestrator can tell a *user-driven* open/close apart from a
 * *system-driven* transient collapse (the panel hides while element-picking,
 * or the whole widget goes dark). Persisting inside the composer would clobber
 * the user's open/closed choice on every transient flip. Mirrors the shape of
 * `settings/storage.ts` / `launcher/storage.ts`: localStorage by default,
 * wrapped in try/catch because storage is unavailable under file://, Safari
 * private mode, sandboxed iframes, and quota-exceeded conditions. A dropped
 * read falls back to the caller's default; a dropped write loses the user's
 * most recent toggle, which is acceptable for a dev-only widget.
 */
export const WIDGET_VISIBLE_STORAGE_KEY = 'agent-devtools:widgetVisible';
export const PANEL_OPEN_STORAGE_KEY = 'agent-devtools:panelOpen';

export interface VisibilityStorageOptions {
  /** Storage backend. Defaults to `globalThis.localStorage`. Pass `null` to disable. */
  readonly storage?: Storage | null;
}

function resolveStorage(options: VisibilityStorageOptions): Storage | null {
  if (options.storage !== undefined) return options.storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Read a persisted boolean. Returns `null` when nothing is stored (or the
 * stored value is not one of the two canonical strings), so the caller can
 * apply its own default rather than guessing.
 */
function loadBoolean(key: string, options: VisibilityStorageOptions): boolean | null {
  const storage = resolveStorage(options);
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

function saveBoolean(key: string, value: boolean, options: VisibilityStorageOptions): void {
  const storage = resolveStorage(options);
  if (!storage) return;
  try {
    storage.setItem(key, value ? 'true' : 'false');
  } catch {
    /* silent — quota / disabled storage is fine */
  }
}

/** Persisted widget-level visibility, or `null` when nothing is stored. */
export function loadWidgetVisible(options: VisibilityStorageOptions = {}): boolean | null {
  return loadBoolean(WIDGET_VISIBLE_STORAGE_KEY, options);
}

export function saveWidgetVisible(visible: boolean, options: VisibilityStorageOptions = {}): void {
  saveBoolean(WIDGET_VISIBLE_STORAGE_KEY, visible, options);
}

/** Persisted composer-open state, or `null` when nothing is stored. */
export function loadPanelOpen(options: VisibilityStorageOptions = {}): boolean | null {
  return loadBoolean(PANEL_OPEN_STORAGE_KEY, options);
}

export function savePanelOpen(open: boolean, options: VisibilityStorageOptions = {}): void {
  saveBoolean(PANEL_OPEN_STORAGE_KEY, open, options);
}
