/**
 * Widget-side settings model. Mirrors the server's `ProviderId` /
 * `PermissionMode` unions exactly — they share a wire format so duplication
 * here is intentional rather than imported, to keep the widget bundle free
 * of a server import path.
 */

export type ProviderId = 'acp' | 'sdk';

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk';

/**
 * Widget colour scheme. `auto` follows the host OS `prefers-color-scheme`;
 * `light` / `dark` pin the scheme regardless of the OS preference.
 */
export type ThemeMode = 'auto' | 'light' | 'dark';

/**
 * Model selection for the next prompt. These are the same aliases the Claude
 * Code terminal's `/model` menu exposes — both the ACP agent and the Agent
 * SDK resolve them against the account's real models through the shared SDK
 * resolver, so the widget needs no live model-discovery round-trip. `default`
 * is the sentinel for "send no model": the chosen provider then falls back to
 * its own default, matching the terminal with no `/model` override.
 *
 * The wire field this maps to is intentionally open (the server validates
 * only that it is a non-empty string), so a future full date-pinned id or a
 * new tier can be threaded through without a protocol change — this closed
 * union is just the widget's curated menu.
 */
export type ModelId = 'default' | 'opus' | 'sonnet' | 'haiku';

export interface Settings {
  /** Which runtime backend services the next prompt. */
  readonly provider: ProviderId;
  /**
   * Resolution policy for `requestPermission` callbacks. `bypassPermissions`
   * is exposed ONLY through the settings panel (never the chat composer)
   * because it disables every safety prompt for the rest of the session.
   */
  readonly permissionMode: PermissionMode;
  /**
   * Widget colour scheme. Persisted alongside `provider` so a reload keeps
   * the user's chosen appearance. `auto` defers to the host OS preference.
   */
  readonly theme: ThemeMode;
  /**
   * Model the next prompt runs on. `default` sends no model on the wire and
   * lets the provider use its own default; the other values are forwarded as
   * aliases the provider resolves. Persisted alongside `provider` so a reload
   * keeps the user's chosen model.
   */
  readonly model: ModelId;
  /**
   * Header-level safety switch. When `true` the widget asks the agent to
   * prompt for `bash`, `webFetch`, and `mcpTool` actions while keeping
   * `fileEdit` on auto. Stored in memory only and resets to `true` on
   * every widget mount — by design, so a fresh tab never silently inherits
   * a relaxed safety posture from a previous session.
   */
  readonly safeMode: boolean;
}

export const PROVIDER_IDS: readonly ProviderId[] = ['acp', 'sdk'];

export const PERMISSION_MODES: readonly PermissionMode[] = [
  'default',
  'acceptEdits',
  'bypassPermissions',
  'plan',
  'dontAsk',
];

export const THEME_MODES: readonly ThemeMode[] = ['auto', 'light', 'dark'];

export const MODEL_IDS: readonly ModelId[] = ['default', 'opus', 'sonnet', 'haiku'];

/**
 * Match the server's defaults so a fresh widget mounted with no localStorage
 * doesn't accidentally diverge from the dev-server's behaviour.
 */
export const DEFAULT_SETTINGS: Settings = {
  provider: 'acp',
  permissionMode: 'acceptEdits',
  theme: 'auto',
  model: 'default',
  safeMode: true,
};

/**
 * Read-only server snapshot served from `/v1/agent/info`. Lets the widget
 * surface the active workspace root and disable provider options that the
 * server doesn't actually have registered.
 */
export interface AgentServerInfo {
  /** Canonical absolute workspace root the agent reads/edits within. */
  readonly workspaceRoot: string | null;
  /** Provider runtimes currently registered on the server. */
  readonly providers: readonly ProviderId[];
  /** Provider used when the request body omits `provider`. */
  readonly defaultProvider: ProviderId;
  /** Permission mode used when the request body omits `permissionMode`. */
  readonly defaultPermissionMode: PermissionMode;
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}

export function isPermissionMode(value: unknown): value is PermissionMode {
  return typeof value === 'string' && (PERMISSION_MODES as readonly string[]).includes(value);
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value);
}

export function isModelId(value: unknown): value is ModelId {
  return typeof value === 'string' && (MODEL_IDS as readonly string[]).includes(value);
}
