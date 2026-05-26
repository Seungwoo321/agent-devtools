/**
 * Widget-side settings model. Mirrors the server's `ProviderId` /
 * `PermissionMode` unions exactly — they share a wire format so duplication
 * here is intentional rather than imported, to keep the widget bundle free
 * of a server import path.
 */

export type ProviderId = 'acp' | 'sdk';

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk';

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

/**
 * Match the server's defaults so a fresh widget mounted with no localStorage
 * doesn't accidentally diverge from the dev-server's behaviour.
 */
export const DEFAULT_SETTINGS: Settings = {
  provider: 'acp',
  permissionMode: 'acceptEdits',
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
