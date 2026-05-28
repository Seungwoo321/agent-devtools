/**
 * Mount a Shadow DOM container that hosts the agent-devtools widget UI.
 * The shadow root provides three things:
 *
 *   1. Style isolation — page CSS can't accidentally restyle the widget,
 *      and the widget's CSS can't bleed back into the page. We use a closed
 *      shadow root and reset inherited styles via `:host { all: initial }`.
 *   2. A stable container the launcher / composer / stream can append into,
 *      without coordinating z-index against the host app's stacking context.
 *   3. A single mount/unmount lifecycle: callers create the root, attach UI
 *      into `host`, and discard the handle to tear everything down.
 *
 * The host element itself stays a plain `<div>` on the page. Layout
 * constraints (position: fixed, z-index, viewport pinning) live in the
 * launcher — the shell only owns isolation.
 */

const HOST_TAG = 'agent-devtools-widget';
const HOST_ATTR = 'data-agent-devtools-widget';

export interface ShadowWidgetRoot {
  /** The page-level host element (parented to <body>). */
  readonly host: HTMLElement;
  /** The shadow root attached to `host`; widget UI mounts inside this. */
  readonly shadowRoot: ShadowRoot;
  /**
   * Empty container inside the shadow root. The launcher, composer and
   * message stream all append into this rather than `shadowRoot` directly
   * so the host CSS can target a known wrapper.
   */
  readonly container: HTMLElement;
  /** Remove the host from the page. Safe to call multiple times. */
  destroy(): void;
}

export interface CreateShadowWidgetRootOptions {
  /** Document to attach to. Defaults to `globalThis.document`. */
  document?: Document;
  /**
   * Parent for the host element. Defaults to `document.body`. Tests can
   * override to a detached container.
   */
  parent?: HTMLElement;
  /**
   * Use an open shadow root instead of closed. The default (closed) hides
   * the internals from page scripts; pass `true` only when you need to
   * inspect the widget tree from devtools.
   */
  openMode?: boolean;
  /**
   * Extra CSS to install inside the shadow root, appended after the base
   * isolation styles.
   */
  extraStyles?: string;
}

/**
 * Theme attribute the orchestrator flips on the host element. The selectors
 * below recolour the whole widget by remapping the design tokens — a single
 * DOM write swaps every component because they all read `var(--adt-*)`.
 */
export const THEME_ATTR = 'data-theme';

/**
 * Design tokens — dark palette only.
 *
 * Light is the *absence* of these tokens: every component references a colour
 * as `var(--adt-*, <light-literal>)`, so when no token is defined the literal
 * fallback (the original pre-theming colour) applies. That makes the light
 * theme byte-identical to the old look and preserves each element's own light
 * nuance (e.g. a 0.06 vs 0.16 border alpha) without enumerating it here.
 *
 * Dark, by contrast, is defined once in this block and applied in two places —
 * the explicit `[data-theme="dark"]` selector and the `auto` +
 * `prefers-color-scheme: dark` media query — so the dark palette has a single
 * source of truth. Flipping the host's `data-theme` attribute is the only
 * write needed to recolour the whole widget.
 */
const DARK_TOKENS = `
  color-scheme: dark;
  --adt-surface: #1e1e1e;
  --adt-surface-raised: #2a2a2e;
  --adt-text: #e8e8ea;
  --adt-text-muted: #9ca3af;
  --adt-accent: #e8e8ea;
  --adt-accent-text: #1a1a1a;
  --adt-border: rgba(255, 255, 255, 0.14);
  --adt-chip-bg: #2f2f33;
  --adt-overlay-weak: rgba(255, 255, 255, 0.08);
  --adt-backdrop: rgba(0, 0, 0, 0.6);
  --adt-user-bubble-bg: rgba(255, 255, 255, 0.1);
  --adt-assistant-bubble-bg: #2a2a2e;
  --adt-assistant-bubble-text: #e8e8ea;
  --adt-danger: #ff6b6b;
  --adt-danger-bg: rgba(255, 107, 107, 0.14);
  --adt-success: #4ade80;
  --adt-shadow: rgba(0, 0, 0, 0.5);
`;

const BASE_STYLES = `
:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.4;
  color-scheme: light;
  color: var(--adt-text, #1a1a1a);
  contain: layout style;
}
:host([${THEME_ATTR}="dark"]) {
${DARK_TOKENS}
}
@media (prefers-color-scheme: dark) {
  :host([${THEME_ATTR}="auto"]) {
${DARK_TOKENS}
  }
}
*, *::before, *::after {
  box-sizing: border-box;
}
[data-widget-container] {
  position: fixed;
  inset: auto 0 0 auto;
  pointer-events: none;
  z-index: 2147483646;
}
[data-widget-container] > * {
  pointer-events: auto;
}
`;

export function createShadowWidgetRoot(
  options: CreateShadowWidgetRootOptions = {},
): ShadowWidgetRoot {
  const doc = options.document ?? globalThis.document;
  const parent = options.parent ?? doc.body;

  const existing = doc.querySelector(`[${HOST_ATTR}]`);
  if (existing) {
    throw new Error('agent-devtools widget is already mounted in this document');
  }

  const host = doc.createElement(HOST_TAG);
  host.setAttribute(HOST_ATTR, '');
  parent.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: options.openMode ? 'open' : 'closed' });

  const styleEl = doc.createElement('style');
  styleEl.textContent = options.extraStyles
    ? `${BASE_STYLES}\n${options.extraStyles}`
    : BASE_STYLES;
  shadowRoot.appendChild(styleEl);

  const container = doc.createElement('div');
  container.setAttribute('data-widget-container', '');
  shadowRoot.appendChild(container);

  let destroyed = false;
  return {
    host,
    shadowRoot,
    container,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      host.remove();
    },
  };
}
