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
 * launcher (ADT-21) — the shell only owns isolation.
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

const BASE_STYLES = `
:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.4;
  color: #1a1a1a;
  contain: layout style;
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
