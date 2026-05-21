/**
 * Chat composer panel. Renders inside the shadow-root container next to the
 * launcher and emits `submit` payloads carrying the user's prompt plus the
 * currently-picked element descriptor.
 *
 * The composer is a controlled view: it doesn't own picker lifecycle, errors
 * or transport. The orchestrator (next units) feeds it `picked`,
 * `pickerActive`, `sending` and listens to `onSubmit` / `onTogglePicker`.
 * That keeps this file scoped to DOM and the panel's local state (text +
 * visibility), avoiding leakage from network or picker concerns.
 *
 * Keyboard contract:
 *   - Enter (without Shift) submits when text is non-empty and not sending.
 *   - Shift+Enter inserts a newline.
 *   - Escape clears focus and hides the panel.
 */
import type { PickedEvidence } from '../context/types.js';

const PANEL_ATTR = 'data-agent-devtools-composer';
const PICK_TOGGLE_ATTR = 'data-agent-devtools-composer-pick';
const SETTINGS_TOGGLE_ATTR = 'data-agent-devtools-composer-settings';
const HANDOFF_ATTR = 'data-agent-devtools-composer-handoff';
const NEW_SESSION_ATTR = 'data-agent-devtools-composer-new-session';
const CHIP_ATTR = 'data-agent-devtools-composer-chip';
const TEXTAREA_ATTR = 'data-agent-devtools-composer-input';
const SEND_ATTR = 'data-agent-devtools-composer-send';
const CLOSE_ATTR = 'data-agent-devtools-composer-close';
const RESIZE_HANDLE_ATTR = 'data-agent-devtools-composer-resize';

/**
 * Resize axis identifiers. The panel is fixed-anchored to the launcher
 * (bottom-right by default), so the four edge handles + four corners give
 * the user a full 8-way grab surface. Drag semantics per axis:
 *   - `left` / `corner-nw` / `corner-sw`:   drag LEFT  → width  grows (left edge slides outward).
 *   - `right` / `corner-ne` / `corner-se`:  drag RIGHT → width  grows AND `right` style decreases (right edge follows cursor).
 *   - `top` / `corner-nw` / `corner-ne`:    drag UP    → height grows (top edge slides outward; bottom anchored).
 *   - `bottom` / `corner-sw` / `corner-se`: drag DOWN  → height grows AND `bottom` style decreases (bottom edge follows cursor).
 * The launcher anchor reasserts itself on the next `setAnchor` call, so a
 * free right/bottom drag persists until the launcher moves.
 */
type ResizeAxis =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'corner-nw'
  | 'corner-ne'
  | 'corner-sw'
  | 'corner-se';

const RESIZE_AXES: readonly ResizeAxis[] = [
  'left',
  'right',
  'top',
  'bottom',
  'corner-nw',
  'corner-ne',
  'corner-sw',
  'corner-se',
];

function axisGrowsLeft(axis: ResizeAxis): boolean {
  return axis === 'left' || axis === 'corner-nw' || axis === 'corner-sw';
}
function axisGrowsRight(axis: ResizeAxis): boolean {
  return axis === 'right' || axis === 'corner-ne' || axis === 'corner-se';
}
function axisGrowsTop(axis: ResizeAxis): boolean {
  return axis === 'top' || axis === 'corner-nw' || axis === 'corner-ne';
}
function axisGrowsBottom(axis: ResizeAxis): boolean {
  return axis === 'bottom' || axis === 'corner-sw' || axis === 'corner-se';
}

const PANEL_DEFAULT_WIDTH = 320;
const PANEL_DEFAULT_HEIGHT = 420;
const PANEL_MIN_WIDTH = 280;
const PANEL_MIN_HEIGHT = 240;
const PANEL_SIZE_STORAGE_KEY = 'agent-devtools:panelSize';

export interface ComposerSubmitPayload {
  readonly text: string;
  readonly picked: PickedEvidence | null;
}

/**
 * Launcher offsets used to compute the composer's anchor.
 *
 * `x` is the launcher's distance from the viewport's right edge in CSS px,
 * `y` its distance from the bottom edge — i.e. the same coordinate space
 * the launcher itself uses to set `right`/`bottom`. The composer aligns
 * its right edge with the launcher's right edge and sits `gap` px above
 * the launcher button.
 */
export interface ComposerAnchor {
  readonly x: number;
  readonly y: number;
  /** Launcher square size in CSS px. Defaults to 48 (matches launcher default). */
  readonly launcherSize?: number;
  /** Vertical gap between the launcher's top edge and the composer's bottom edge. Defaults to 16. */
  readonly gap?: number;
}

const DEFAULT_LAUNCHER_SIZE = 48;
const DEFAULT_ANCHOR_GAP = 16;

export interface CreateComposerOptions {
  /** Shadow-root container to mount inside. */
  readonly container: HTMLElement;
  /** Document override. Defaults to `container.ownerDocument`. */
  readonly document?: Document;
  /**
   * Storage backend for persisting the user's drag-resized panel size.
   * Defaults to `globalThis.localStorage`. Tests inject a stub. Pass
   * `null` to disable persistence entirely.
   */
  readonly sizeStorage?: Storage | null;
  /** Storage key for the persisted panel size. Defaults to `agent-devtools:panelSize`. */
  readonly sizeStorageKey?: string;
  /** Initial visibility. Defaults to false. */
  readonly visible?: boolean;
  /** Initial picked descriptor. */
  readonly picked?: PickedEvidence | null;
  /** Initial picker-active flag (drives the toggle button style). */
  readonly pickerActive?: boolean;
  /** Required: called with `{ text, picked }` when the user submits. */
  readonly onSubmit: (payload: ComposerSubmitPayload) => void;
  /** Called when the user toggles the pick-element button. */
  readonly onTogglePicker?: (next: boolean) => void;
  /** Called when the user clears the picked chip. */
  readonly onClearPicked?: () => void;
  /** Called when the user closes the composer (Escape / close button). */
  readonly onClose?: () => void;
  /**
   * Called when the user clicks the gear icon. The orchestrator owns the
   * settings panel (created from `../settings`), so the composer only emits
   * the intent — it doesn't render the panel itself.
   */
  readonly onToggleSettings?: () => void;
  /**
   * Called when the user clicks the terminal-handoff button. The
   * orchestrator collects the conversation history, picked element, and
   * page context, POSTs to `/v1/agent/handoff`, and renders a modal with
   * the resulting `claude --append-system-prompt-file …` command.
   */
  readonly onHandoff?: () => void;
  /**
   * Called when the user clicks the "new conversation" button. The
   * orchestrator clears the message store (which also clears persisted
   * conversation in sessionStorage) and asks the transport to mint a
   * fresh `clientSessionId` so the next prompt opens a brand-new
   * server-side ACP session — the agent forgets prior turns.
   */
  readonly onNewSession?: () => void;
}

export interface ComposerHandle {
  /** Root panel element. */
  readonly element: HTMLElement;
  /** Update the picked descriptor (or clear it). */
  setPicked(picked: PickedEvidence | null): void;
  /** Highlight the pick toggle. */
  setPickerActive(active: boolean): void;
  /** Highlight the gear icon while the settings overlay is open. */
  setSettingsActive(active: boolean): void;
  /** Disable input + send while a request is in flight. */
  setSending(sending: boolean): void;
  /** Show / hide the panel. */
  setVisible(visible: boolean): void;
  /**
   * Anchor the panel to the launcher's position. The composer's right edge
   * aligns with the launcher's right edge, and its bottom sits one `gap`
   * above the launcher's top edge. If the panel would overflow the top of
   * the viewport (launcher dragged near the top), it slides down so its
   * top sticks to the viewport top.
   */
  setAnchor(anchor: ComposerAnchor): void;
  /** Set the textarea value programmatically. */
  setText(text: string): void;
  /** Current text. */
  getText(): string;
  /** Focus the textarea. */
  focus(): void;
  /** Remove the panel and detach listeners. */
  destroy(): void;
}

export function createComposer(options: CreateComposerOptions): ComposerHandle {
  const container = options.container;
  const doc = options.document ?? container.ownerDocument;
  if (!doc) throw new Error('createComposer: container must be in a document');

  let picked: PickedEvidence | null = options.picked ?? null;
  let pickerActive = options.pickerActive ?? false;
  let settingsActive = false;
  let sending = false;
  let visible = options.visible ?? false;
  let destroyed = false;

  const panel = doc.createElement('div');
  panel.setAttribute(PANEL_ATTR, '');
  applyPanelStyles(panel);

  // Drag-resize state. The panel anchors to the launcher (bottom-right by
  // default) but mounts an 8-way handle set so the user can grow/shrink
  // from any edge or corner. The four "outward" axes (right / bottom /
  // corner-ne / corner-se / corner-sw — anything that decreases the panel's
  // `right` or `bottom` style) explicitly track CSS px so the dragged edge
  // visibly follows the cursor instead of the opposite edge moving. The
  // launcher anchor reasserts itself on the next `setAnchor` call.
  const sizeStorage = resolveSizeStorage(options.sizeStorage);
  const sizeStorageKey = options.sizeStorageKey ?? PANEL_SIZE_STORAGE_KEY;
  let lastAnchor: ComposerAnchor | null = null;
  const initialSize = loadPanelSize(sizeStorage, sizeStorageKey);
  applyPanelSize(panel, initialSize.width, initialSize.height);
  const resizeHandles = new Map<ResizeAxis, HTMLElement>();
  for (const axis of RESIZE_AXES) {
    const el = doc.createElement('div');
    el.setAttribute(RESIZE_HANDLE_ATTR, axis);
    el.setAttribute('aria-hidden', 'true');
    applyResizeHandleStyles(el, axis);
    panel.appendChild(el);
    resizeHandles.set(axis, el);
  }

  const header = doc.createElement('header');
  applyHeaderStyles(header);
  const title = doc.createElement('span');
  title.textContent = 'agent';
  applyTitleStyles(title);
  const pickButton = doc.createElement('button');
  pickButton.type = 'button';
  pickButton.setAttribute(PICK_TOGGLE_ATTR, '');
  pickButton.setAttribute('aria-label', 'Pick element');
  pickButton.textContent = 'Pick';
  applyPickButtonStyles(pickButton, pickerActive);
  const settingsButton = doc.createElement('button');
  settingsButton.type = 'button';
  settingsButton.setAttribute(SETTINGS_TOGGLE_ATTR, '');
  settingsButton.setAttribute('aria-label', 'Open settings');
  // Plain U+2699 GEAR rather than an SVG to dodge a font-rendering edge case
  // in shadow roots and keep the bundle tiny.
  settingsButton.textContent = '⚙';
  applyIconButtonStyles(settingsButton, settingsActive);
  // U+2934 (right-then-down arrow) reads as "send out / take elsewhere" —
  // matches the verb "hand off this conversation to another runtime".
  const handoffButton = doc.createElement('button');
  handoffButton.type = 'button';
  handoffButton.setAttribute(HANDOFF_ATTR, '');
  handoffButton.setAttribute('aria-label', 'Continue in terminal');
  handoffButton.setAttribute('title', 'Continue this conversation in your terminal');
  handoffButton.textContent = '⤴';
  applyIconButtonStyles(handoffButton, false);
  // U+2295 (circled plus) reads unambiguously as "start a new thing" and
  // renders crisply at 14px without depending on emoji fonts. The action is
  // destructive (drops the current conversation + mints a fresh server-side
  // ACP session), so the title spells it out.
  const newSessionButton = doc.createElement('button');
  newSessionButton.type = 'button';
  newSessionButton.setAttribute(NEW_SESSION_ATTR, '');
  newSessionButton.setAttribute('aria-label', 'Start a new conversation');
  newSessionButton.setAttribute(
    'title',
    'Start a new conversation (clears history and resets the agent session)',
  );
  newSessionButton.textContent = '⊕';
  applyIconButtonStyles(newSessionButton, false);
  const closeButton = doc.createElement('button');
  closeButton.type = 'button';
  closeButton.setAttribute(CLOSE_ATTR, '');
  closeButton.setAttribute('aria-label', 'Close composer');
  closeButton.textContent = '✕';
  applyCloseButtonStyles(closeButton);
  header.appendChild(title);
  header.appendChild(pickButton);
  header.appendChild(handoffButton);
  header.appendChild(newSessionButton);
  header.appendChild(settingsButton);
  header.appendChild(closeButton);

  const chipHost = doc.createElement('div');
  chipHost.setAttribute(CHIP_ATTR, '');
  applyChipHostStyles(chipHost);

  const textarea = doc.createElement('textarea');
  textarea.setAttribute(TEXTAREA_ATTR, '');
  textarea.setAttribute('placeholder', 'Ask the agent about this page…');
  textarea.rows = 3;
  applyTextareaStyles(textarea);

  const footer = doc.createElement('footer');
  applyFooterStyles(footer);
  const sendButton = doc.createElement('button');
  sendButton.type = 'button';
  sendButton.setAttribute(SEND_ATTR, '');
  sendButton.textContent = 'Send';
  applySendButtonStyles(sendButton);
  sendButton.disabled = true;
  footer.appendChild(sendButton);

  panel.appendChild(header);
  panel.appendChild(chipHost);
  panel.appendChild(textarea);
  panel.appendChild(footer);
  container.appendChild(panel);

  renderChip();
  renderVisibility();

  function renderChip(): void {
    chipHost.innerHTML = '';
    if (!picked) return;
    const chip = doc!.createElement('span');
    applyChipStyles(chip);
    const label = doc!.createElement('span');
    label.setAttribute('data-agent-devtools-composer-chip-label', '');
    label.textContent = picked.componentName || picked.tagName.toLowerCase();
    chip.appendChild(label);
    const remove = doc!.createElement('button');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Remove picked element');
    remove.textContent = '✕';
    applyChipRemoveStyles(remove);
    remove.addEventListener('click', onClearPicked);
    chip.appendChild(remove);
    chipHost.appendChild(chip);
  }

  function renderVisibility(): void {
    panel.style.display = visible ? 'flex' : 'none';
  }

  function refreshSendDisabled(): void {
    sendButton.disabled = sending || textarea.value.trim().length === 0;
  }

  function onInput(): void {
    refreshSendDisabled();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      options.onClose?.();
    }
  }

  function submit(): void {
    if (sending) return;
    const text = textarea.value.trim();
    if (!text) return;
    options.onSubmit({ text, picked });
  }

  function onSendClick(): void {
    submit();
  }

  function onPickClick(): void {
    options.onTogglePicker?.(!pickerActive);
  }

  function onSettingsClick(): void {
    options.onToggleSettings?.();
  }

  function onHandoffClick(): void {
    options.onHandoff?.();
  }

  function onNewSessionClick(): void {
    options.onNewSession?.();
  }

  function onCloseClick(): void {
    options.onClose?.();
  }

  function onClearPicked(): void {
    options.onClearPicked?.();
  }

  // Stop pointer events on the panel from reaching the page; the shadow
  // host's pointer-events:none lets the panel itself opt in here.
  function onPointerDown(event: PointerEvent): void {
    event.stopPropagation();
  }

  interface ResizeDrag {
    readonly axis: ResizeAxis;
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly startWidth: number;
    readonly startHeight: number;
    /** Panel's `right` CSS value at pointerdown, in px. */
    readonly startRight: number;
    /** Panel's `bottom` CSS value at pointerdown, in px. */
    readonly startBottom: number;
  }
  let activeDrag: ResizeDrag | null = null;

  function onHandlePointerDown(axis: ResizeAxis) {
    return (event: PointerEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      const rect = panel.getBoundingClientRect();
      activeDrag = {
        axis,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: rect.width || panel.offsetWidth || PANEL_DEFAULT_WIDTH,
        startHeight: rect.height || panel.offsetHeight || PANEL_DEFAULT_HEIGHT,
        startRight: parseFloat(panel.style.right) || 0,
        startBottom: parseFloat(panel.style.bottom) || 0,
      };
      const handle = event.currentTarget as HTMLElement;
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        /* setPointerCapture is unsupported in some test envs — fine */
      }
    };
  }

  function onHandlePointerMove(event: PointerEvent): void {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    event.preventDefault();
    const deltaX = event.clientX - activeDrag.startX;
    const deltaY = event.clientY - activeDrag.startY;

    // Width: left-side axes grow when cursor moves left (-deltaX), right-side
    // axes grow when cursor moves right (+deltaX). Pure-vertical axes
    // (top/bottom) leave width untouched.
    let nextWidth = activeDrag.startWidth;
    if (axisGrowsLeft(activeDrag.axis)) {
      nextWidth = activeDrag.startWidth - deltaX;
    } else if (axisGrowsRight(activeDrag.axis)) {
      nextWidth = activeDrag.startWidth + deltaX;
    }

    // Height mirrors width across the vertical axis.
    let nextHeight = activeDrag.startHeight;
    if (axisGrowsTop(activeDrag.axis)) {
      nextHeight = activeDrag.startHeight - deltaY;
    } else if (axisGrowsBottom(activeDrag.axis)) {
      nextHeight = activeDrag.startHeight + deltaY;
    }

    applyPanelSize(panel, nextWidth, nextHeight);

    const touchesRight = axisGrowsRight(activeDrag.axis);
    const touchesBottom = axisGrowsBottom(activeDrag.axis);

    if (touchesRight || touchesBottom) {
      // The user is actively dragging the right and/or bottom edge of the
      // panel — let those edges follow the cursor directly. Skip
      // `applyAnchor` because it would yank `right`/`bottom` back to the
      // launcher-derived values and undo the visible drag. The launcher
      // anchor re-asserts itself on the next `setAnchor` call.
      if (touchesRight) {
        panel.style.right = `${Math.max(0, activeDrag.startRight - deltaX)}px`;
      }
      if (touchesBottom) {
        panel.style.bottom = `${Math.max(0, activeDrag.startBottom - deltaY)}px`;
      }
      // Corner-ne still grows the top edge upward — clamp `bottom` for the
      // top-overflow case, but only via the standalone clamp (not
      // applyAnchor) so the just-set `right` survives.
      if (axisGrowsTop(activeDrag.axis)) {
        clampBottomForTopOverflow(panel);
      }
      return;
    }

    // Inward axes (left / top / corner-nw): the launcher anchor is the
    // source of truth for right/bottom. Re-apply it on every move so
    // shrinking restores the launcher-derived position after a previous
    // top-overflow clamp pushed `bottom` down.
    if (lastAnchor) applyAnchor(panel, lastAnchor);
  }

  function onHandlePointerUp(event: PointerEvent): void {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    const handle = event.currentTarget as HTMLElement;
    try {
      handle.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    activeDrag = null;
    const width = panel.offsetWidth || parseFloat(panel.style.width) || PANEL_DEFAULT_WIDTH;
    const height = panel.offsetHeight || parseFloat(panel.style.height) || PANEL_DEFAULT_HEIGHT;
    savePanelSize(sizeStorage, sizeStorageKey, width, height);
  }

  const handleListeners: Array<[HTMLElement, (event: PointerEvent) => void, () => void]> = [];
  for (const [axis, el] of resizeHandles) {
    const down = onHandlePointerDown(axis);
    el.addEventListener('pointerdown', down as EventListener);
    el.addEventListener('pointermove', onHandlePointerMove as EventListener);
    el.addEventListener('pointerup', onHandlePointerUp as EventListener);
    handleListeners.push([
      el,
      down as (event: PointerEvent) => void,
      () => {
        el.removeEventListener('pointerdown', down as EventListener);
        el.removeEventListener('pointermove', onHandlePointerMove as EventListener);
        el.removeEventListener('pointerup', onHandlePointerUp as EventListener);
      },
    ]);
  }

  textarea.addEventListener('input', onInput);
  textarea.addEventListener('keydown', onKeyDown);
  sendButton.addEventListener('click', onSendClick);
  pickButton.addEventListener('click', onPickClick);
  settingsButton.addEventListener('click', onSettingsClick);
  handoffButton.addEventListener('click', onHandoffClick);
  newSessionButton.addEventListener('click', onNewSessionClick);
  closeButton.addEventListener('click', onCloseClick);
  panel.addEventListener('pointerdown', onPointerDown);

  return {
    element: panel,
    setPicked(next): void {
      if (destroyed) return;
      picked = next;
      renderChip();
    },
    setPickerActive(active): void {
      if (destroyed) return;
      pickerActive = active;
      applyPickButtonStyles(pickButton, pickerActive);
    },
    setSettingsActive(active): void {
      if (destroyed) return;
      settingsActive = active;
      applyIconButtonStyles(settingsButton, settingsActive);
    },
    setSending(next): void {
      if (destroyed) return;
      sending = next;
      textarea.disabled = next;
      refreshSendDisabled();
    },
    setVisible(next): void {
      if (destroyed) return;
      visible = next;
      renderVisibility();
    },
    setAnchor(anchor): void {
      if (destroyed) return;
      lastAnchor = anchor;
      applyAnchor(panel, anchor);
    },
    setText(text): void {
      if (destroyed) return;
      textarea.value = text;
      refreshSendDisabled();
    },
    getText(): string {
      return textarea.value;
    },
    focus(): void {
      if (destroyed) return;
      textarea.focus();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      textarea.removeEventListener('input', onInput);
      textarea.removeEventListener('keydown', onKeyDown);
      sendButton.removeEventListener('click', onSendClick);
      pickButton.removeEventListener('click', onPickClick);
      settingsButton.removeEventListener('click', onSettingsClick);
      handoffButton.removeEventListener('click', onHandoffClick);
      newSessionButton.removeEventListener('click', onNewSessionClick);
      closeButton.removeEventListener('click', onCloseClick);
      panel.removeEventListener('pointerdown', onPointerDown);
      for (const [, , detach] of handleListeners) detach();
      panel.remove();
    },
  };
}

function applyPanelStyles(panel: HTMLElement): void {
  const s = panel.style;
  s.position = 'fixed';
  // Default anchor (right: 24, bottom: 88 — directly above a launcher at
  // right: 24, bottom: 24). Replaced as soon as `setAnchor` is called with
  // the live launcher position.
  s.right = '24px';
  s.bottom = '88px';
  // Width / height are owned by the resize subsystem (`applyPanelSize`)
  // so the user's drag-resized dimensions persist across reloads.
  s.background = '#ffffff';
  s.color = '#1a1a1a';
  s.border = '1px solid rgba(0, 0, 0, 0.08)';
  s.borderRadius = '12px';
  s.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.18)';
  s.flexDirection = 'column';
  s.overflow = 'hidden';
  s.fontFamily = 'inherit';
  s.fontSize = '13px';
}

/**
 * Set the panel's explicit width/height after clamping to viewport-aware
 * bounds. Width is bounded by `[PANEL_MIN_WIDTH, 80vw]`, height by
 * `[PANEL_MIN_HEIGHT, 90vh]`. Without an upper bound the user could drag
 * the panel past the viewport edge and lose the close button.
 */
function applyPanelSize(panel: HTMLElement, width: number, height: number): void {
  const view = panel.ownerDocument?.defaultView;
  const maxWidth = view?.innerWidth ? view.innerWidth * 0.8 : 1600;
  const maxHeight = view?.innerHeight ? view.innerHeight * 0.9 : 1200;
  const clampedWidth = Math.round(Math.min(Math.max(width, PANEL_MIN_WIDTH), maxWidth));
  const clampedHeight = Math.round(Math.min(Math.max(height, PANEL_MIN_HEIGHT), maxHeight));
  panel.style.width = `${clampedWidth}px`;
  panel.style.height = `${clampedHeight}px`;
}

function applyResizeHandleStyles(el: HTMLElement, axis: ResizeAxis): void {
  const s = el.style;
  s.position = 'absolute';
  s.background = 'transparent';
  s.touchAction = 'none';
  // Corners (12×12 squares) sit ON TOP of the edge handles (zIndex 2 vs 1)
  // so a diagonal grab resolves to the corner — both axes resize together
  // rather than one edge stealing the event. Edge handles reserve a 6px
  // gap at each end (`top: 6px; bottom: 6px` on vertical edges, mirrored
  // on horizontal) so the corners get a clean target square.
  switch (axis) {
    case 'left':
      s.left = '0';
      s.top = '6px';
      s.bottom = '6px';
      s.width = '6px';
      s.cursor = 'ew-resize';
      s.zIndex = '1';
      return;
    case 'right':
      s.right = '0';
      s.top = '6px';
      s.bottom = '6px';
      s.width = '6px';
      s.cursor = 'ew-resize';
      s.zIndex = '1';
      return;
    case 'top':
      s.left = '6px';
      s.right = '6px';
      s.top = '0';
      s.height = '6px';
      s.cursor = 'ns-resize';
      s.zIndex = '1';
      return;
    case 'bottom':
      s.left = '6px';
      s.right = '6px';
      s.bottom = '0';
      s.height = '6px';
      s.cursor = 'ns-resize';
      s.zIndex = '1';
      return;
    case 'corner-nw':
      s.left = '0';
      s.top = '0';
      s.width = '12px';
      s.height = '12px';
      s.cursor = 'nwse-resize';
      s.zIndex = '2';
      return;
    case 'corner-ne':
      s.right = '0';
      s.top = '0';
      s.width = '12px';
      s.height = '12px';
      s.cursor = 'nesw-resize';
      s.zIndex = '2';
      return;
    case 'corner-sw':
      s.left = '0';
      s.bottom = '0';
      s.width = '12px';
      s.height = '12px';
      s.cursor = 'nesw-resize';
      s.zIndex = '2';
      return;
    case 'corner-se':
      s.right = '0';
      s.bottom = '0';
      s.width = '12px';
      s.height = '12px';
      s.cursor = 'nwse-resize';
      s.zIndex = '2';
      return;
  }
}

/**
 * Push the panel's `bottom` style down so the top edge stays inside the
 * viewport. Called after any height-growing resize so a panel that grew
 * upward past the viewport top is corrected without disturbing `right` —
 * the dedicated path that `applyAnchor` doesn't cover when the user is
 * also dragging the `right` style directly (corner-ne).
 */
function clampBottomForTopOverflow(panel: HTMLElement): void {
  const view = panel.ownerDocument?.defaultView;
  const viewportHeight = view?.innerHeight;
  if (!Number.isFinite(viewportHeight)) return;
  const panelHeight = panel.offsetHeight || parseFloat(panel.style.height) || PANEL_DEFAULT_HEIGHT;
  const bottomPx = parseFloat(panel.style.bottom) || 0;
  if (bottomPx + panelHeight > (viewportHeight as number)) {
    panel.style.bottom = `${Math.max(0, (viewportHeight as number) - panelHeight)}px`;
  }
}

function resolveSizeStorage(override: Storage | null | undefined): Storage | null {
  if (override !== undefined) return override;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

interface PersistedPanelSize {
  readonly width: number;
  readonly height: number;
}

function loadPanelSize(storage: Storage | null, key: string): PersistedPanelSize {
  const fallback: PersistedPanelSize = {
    width: PANEL_DEFAULT_WIDTH,
    height: PANEL_DEFAULT_HEIGHT,
  };
  if (!storage) return fallback;
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return fallback;
  }
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as { width?: unknown; height?: unknown };
    const width =
      typeof parsed.width === 'number' && Number.isFinite(parsed.width)
        ? parsed.width
        : PANEL_DEFAULT_WIDTH;
    const height =
      typeof parsed.height === 'number' && Number.isFinite(parsed.height)
        ? parsed.height
        : PANEL_DEFAULT_HEIGHT;
    return { width, height };
  } catch {
    return fallback;
  }
}

function savePanelSize(storage: Storage | null, key: string, width: number, height: number): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify({ width, height }));
  } catch {
    /* silent — quota / disabled storage is fine */
  }
}

function applyAnchor(panel: HTMLElement, anchor: ComposerAnchor): void {
  const launcherSize = anchor.launcherSize ?? DEFAULT_LAUNCHER_SIZE;
  const gap = anchor.gap ?? DEFAULT_ANCHOR_GAP;
  const right = Math.max(0, anchor.x);
  // Default: sit above the launcher (composer's bottom edge = launcher's top edge + gap).
  let bottom = Math.max(0, anchor.y + launcherSize + gap);

  // If the panel would overflow the top of the viewport (launcher is near
  // the top), slide it down so its top stays inside the viewport. We use
  // the rendered height when available so a tall panel (with a long
  // stream) re-anchors correctly; fall back to the CSS max-height.
  const view = panel.ownerDocument?.defaultView;
  const viewportHeight = view?.innerHeight;
  if (Number.isFinite(viewportHeight)) {
    const panelHeight = panel.offsetHeight || 420;
    const topOffset = bottom + panelHeight;
    if (topOffset > (viewportHeight as number)) {
      bottom = Math.max(0, (viewportHeight as number) - panelHeight);
    }
  }

  panel.style.right = `${right}px`;
  panel.style.bottom = `${bottom}px`;
  panel.style.left = 'auto';
  panel.style.top = 'auto';
}

function applyHeaderStyles(header: HTMLElement): void {
  const s = header.style;
  s.display = 'flex';
  s.alignItems = 'center';
  s.gap = '8px';
  s.padding = '10px 12px';
  s.borderBottom = '1px solid rgba(0, 0, 0, 0.06)';
}

function applyTitleStyles(title: HTMLElement): void {
  const s = title.style;
  s.flex = '1';
  s.fontWeight = '600';
  s.fontSize = '13px';
}

function applyPickButtonStyles(button: HTMLButtonElement, active: boolean): void {
  const s = button.style;
  s.padding = '4px 10px';
  s.borderRadius = '999px';
  s.border = active ? '1px solid #1a1a1a' : '1px solid rgba(0, 0, 0, 0.16)';
  s.background = active ? '#1a1a1a' : 'transparent';
  s.color = active ? '#ffffff' : '#1a1a1a';
  s.fontSize = '12px';
  s.cursor = 'pointer';
}

function applyIconButtonStyles(button: HTMLButtonElement, active: boolean): void {
  const s = button.style;
  s.width = '24px';
  s.height = '24px';
  s.padding = '0';
  s.borderRadius = '6px';
  s.border = '0';
  s.background = active ? 'rgba(0, 0, 0, 0.08)' : 'transparent';
  s.color = active ? '#1a1a1a' : '#666';
  s.cursor = 'pointer';
  s.fontSize = '14px';
  s.lineHeight = '1';
}

function applyCloseButtonStyles(button: HTMLButtonElement): void {
  const s = button.style;
  s.width = '24px';
  s.height = '24px';
  s.padding = '0';
  s.borderRadius = '6px';
  s.border = '0';
  s.background = 'transparent';
  s.color = '#666';
  s.cursor = 'pointer';
  s.fontSize = '14px';
  s.lineHeight = '1';
}

function applyChipHostStyles(host: HTMLElement): void {
  const s = host.style;
  s.padding = '10px 12px 0 12px';
  s.minHeight = '0';
}

function applyChipStyles(chip: HTMLElement): void {
  const s = chip.style;
  s.display = 'inline-flex';
  s.alignItems = 'center';
  s.gap = '6px';
  s.padding = '4px 8px';
  s.borderRadius = '999px';
  s.background = 'rgba(0, 0, 0, 0.06)';
  s.color = '#1a1a1a';
  s.fontSize = '12px';
  s.maxWidth = '100%';
  s.overflow = 'hidden';
  s.textOverflow = 'ellipsis';
  s.whiteSpace = 'nowrap';
}

function applyChipRemoveStyles(button: HTMLButtonElement): void {
  const s = button.style;
  s.width = '16px';
  s.height = '16px';
  s.padding = '0';
  s.borderRadius = '999px';
  s.border = '0';
  s.background = 'rgba(0, 0, 0, 0.12)';
  s.color = '#1a1a1a';
  s.cursor = 'pointer';
  s.fontSize = '10px';
  s.lineHeight = '1';
}

function applyTextareaStyles(textarea: HTMLTextAreaElement): void {
  const s = textarea.style;
  s.margin = '12px';
  s.padding = '8px 10px';
  s.border = '1px solid rgba(0, 0, 0, 0.16)';
  s.borderRadius = '8px';
  s.resize = 'none';
  s.fontFamily = 'inherit';
  s.fontSize = '13px';
  s.lineHeight = '1.4';
  s.background = '#ffffff';
  s.color = '#1a1a1a';
  s.outline = 'none';
}

function applyFooterStyles(footer: HTMLElement): void {
  const s = footer.style;
  s.display = 'flex';
  s.justifyContent = 'flex-end';
  s.padding = '0 12px 12px 12px';
  s.gap = '8px';
}

function applySendButtonStyles(button: HTMLButtonElement): void {
  const s = button.style;
  s.padding = '6px 14px';
  s.borderRadius = '8px';
  s.border = '0';
  s.background = '#1a1a1a';
  s.color = '#ffffff';
  s.fontSize = '13px';
  s.fontWeight = '500';
  s.cursor = 'pointer';
}
