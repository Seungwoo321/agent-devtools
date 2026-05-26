/**
 * Floating launcher button. Owns three concerns:
 *
 *   1. Render a fixed-position button (anchored to the bottom-right of the
 *      container provided by ADT-20's shadow root) with sensible defaults.
 *   2. Translate pointer events into reducer events so click vs. drag is
 *      decided by a pure state machine. The wiring captures the pointer on
 *      press so the drag survives even when the cursor leaves the button.
 *   3. Persist the dragged position to localStorage and restore it on the
 *      next mount, clamped to the live viewport so a smaller window can't
 *      strand the button off-screen.
 */
import {
  createInitialLauncherState,
  reduce,
  type LauncherEvent,
  type LauncherPosition,
  type LauncherReducerOptions,
  type LauncherState,
} from './state.js';
import {
  loadLauncherPosition,
  saveLauncherPosition,
  type LauncherStorageOptions,
} from './storage.js';

const DEFAULT_POSITION: LauncherPosition = { x: 24, y: 24 };
const DEFAULT_SIZE_PX = 48;
const DEFAULT_LABEL = 'Open agent devtools';

const LAUNCHER_ATTR = 'data-agent-devtools-launcher';

export interface CreateLauncherOptions extends LauncherStorageOptions {
  /** Shadow-root container to append the button into. */
  readonly container: HTMLElement;
  /** Document/window to source events and viewport metrics from. Defaults to `container.ownerDocument`. */
  readonly document?: Document;
  /** Default offset from the bottom-right corner if nothing is stored. */
  readonly defaultPosition?: LauncherPosition;
  /** Square button size in CSS px. Defaults to 48. */
  readonly sizePx?: number;
  /** Accessible label. */
  readonly label?: string;
  /** Reducer-level options (drag threshold). */
  readonly reducerOptions?: LauncherReducerOptions;
  /** Called when the user clicks (no drag occurred). */
  readonly onClick?: () => void;
  /** Called after a successful drag-end and persist attempt. */
  readonly onDragEnd?: (position: LauncherPosition) => void;
  /**
   * Fires every time the rendered position changes — during a drag, after
   * a clamp on drag-end, and on `setPosition()`. Use this to keep peer
   * surfaces (e.g. the chat panel) anchored to the launcher in real time.
   */
  readonly onPositionChange?: (position: LauncherPosition) => void;
}

export interface LauncherHandle {
  /** The button element appended to the container. */
  readonly element: HTMLButtonElement;
  /** Current launcher state (read-only snapshot). */
  getState(): LauncherState;
  /** Programmatically move the button. Clamped + persisted. */
  setPosition(position: LauncherPosition): void;
  /** Remove the button from the DOM and detach listeners. */
  destroy(): void;
}

export function createLauncher(options: CreateLauncherOptions): LauncherHandle {
  const container = options.container;
  const doc = options.document ?? container.ownerDocument;
  if (!doc) throw new Error('createLauncher: container must be in a document');
  const view = doc.defaultView ?? globalThis.window;

  const size = options.sizePx ?? DEFAULT_SIZE_PX;
  const defaultPosition = options.defaultPosition ?? DEFAULT_POSITION;
  const stored = loadLauncherPosition({
    ...(options.storage !== undefined && { storage: options.storage }),
    ...(options.key !== undefined && { key: options.key }),
  });
  const initial = clampToViewport(stored ?? defaultPosition, size, view);

  let state = createInitialLauncherState(initial);

  const button = doc.createElement('button');
  button.type = 'button';
  button.setAttribute(LAUNCHER_ATTR, '');
  button.setAttribute('aria-label', options.label ?? DEFAULT_LABEL);
  applyStaticStyles(button, size);
  applyPositionStyles(button, state.position);
  button.appendChild(buildIcon(doc));
  container.appendChild(button);
  // Surface the initial resolved position so peers (composer anchor) can
  // align before the first render frame.
  options.onPositionChange?.(state.position);

  let destroyed = false;

  function dispatch(event: LauncherEvent): void {
    const before = state;
    const { state: next, effect } = reduce(state, event, options.reducerOptions ?? {});
    state = next;
    if (next.position !== before.position) {
      applyPositionStyles(button, next.position);
      options.onPositionChange?.(next.position);
    }
    if (effect?.type === 'click') {
      options.onClick?.();
    } else if (effect?.type === 'drag-end') {
      const clamped = clampToViewport(effect.position, size, view);
      if (clamped.x !== state.position.x || clamped.y !== state.position.y) {
        state = { position: clamped, drag: null };
        applyPositionStyles(button, clamped);
        options.onPositionChange?.(clamped);
      }
      saveLauncherPosition(clamped, {
        ...(options.storage !== undefined && { storage: options.storage }),
        ...(options.key !== undefined && { key: options.key }),
      });
      options.onDragEnd?.(clamped);
    }
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    button.setPointerCapture?.(event.pointerId);
    dispatch({ type: 'pointer-down', client: { x: event.clientX, y: event.clientY } });
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (!state.drag) return;
    dispatch({ type: 'pointer-move', client: { x: event.clientX, y: event.clientY } });
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (!state.drag) return;
    if (button.hasPointerCapture?.(event.pointerId)) {
      button.releasePointerCapture?.(event.pointerId);
    }
    dispatch({ type: 'pointer-up' });
  };
  const onPointerCancel = (event: PointerEvent): void => {
    if (!state.drag) return;
    if (button.hasPointerCapture?.(event.pointerId)) {
      button.releasePointerCapture?.(event.pointerId);
    }
    dispatch({ type: 'pointer-cancel' });
  };
  // The browser fires a synthetic click after pointerup. Suppress it during
  // an actual drag so consumers don't see a stray click.
  const onClick = (event: MouseEvent): void => {
    // Reducer already cleared drag on pointer-up; we only need to handle the
    // case where pointer-up's effect was 'drag-end' — but in that case the
    // state machine has already discarded the drag. We can't distinguish at
    // this layer, so the contract is: onClick is only fired via reducer
    // effect, never via DOM click. Stop the DOM click from propagating to
    // page handlers so we don't ship duplicate events.
    event.stopPropagation();
  };

  button.addEventListener('pointerdown', onPointerDown);
  button.addEventListener('pointermove', onPointerMove);
  button.addEventListener('pointerup', onPointerUp);
  button.addEventListener('pointercancel', onPointerCancel);
  button.addEventListener('click', onClick);

  return {
    element: button,
    getState(): LauncherState {
      return state;
    },
    setPosition(position: LauncherPosition): void {
      if (destroyed) return;
      const clamped = clampToViewport(position, size, view);
      dispatch({ type: 'set-position', position: clamped });
      saveLauncherPosition(clamped, {
        ...(options.storage !== undefined && { storage: options.storage }),
        ...(options.key !== undefined && { key: options.key }),
      });
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      button.removeEventListener('pointerdown', onPointerDown);
      button.removeEventListener('pointermove', onPointerMove);
      button.removeEventListener('pointerup', onPointerUp);
      button.removeEventListener('pointercancel', onPointerCancel);
      button.removeEventListener('click', onClick);
      button.remove();
    },
  };
}

function applyStaticStyles(button: HTMLButtonElement, size: number): void {
  const s = button.style;
  s.position = 'fixed';
  s.width = `${size}px`;
  s.height = `${size}px`;
  s.borderRadius = '50%';
  s.border = '0';
  s.padding = '0';
  s.margin = '0';
  s.cursor = 'grab';
  s.background = '#1a1a1a';
  s.color = '#ffffff';
  s.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.25)';
  s.display = 'flex';
  s.alignItems = 'center';
  s.justifyContent = 'center';
  s.userSelect = 'none';
  s.touchAction = 'none';
  s.fontFamily = 'inherit';
  s.fontSize = '20px';
  s.lineHeight = '1';
}

function applyPositionStyles(button: HTMLButtonElement, position: LauncherPosition): void {
  button.style.right = `${position.x}px`;
  button.style.bottom = `${position.y}px`;
  button.style.left = 'auto';
  button.style.top = 'auto';
}

function buildIcon(doc: Document): SVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS(NS, 'path');
  path.setAttribute(
    'd',
    'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  );
  svg.appendChild(path);
  return svg;
}

interface ViewLike {
  readonly innerWidth: number;
  readonly innerHeight: number;
}

function clampToViewport(
  position: LauncherPosition,
  size: number,
  view: ViewLike | null,
): LauncherPosition {
  const width = view?.innerWidth;
  const height = view?.innerHeight;
  // Without viewport metrics (SSR, JSDOM corners), trust the value as-is.
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return {
      x: Number.isFinite(position.x) ? position.x : 0,
      y: Number.isFinite(position.y) ? position.y : 0,
    };
  }
  const maxX = Math.max(0, (width as number) - size);
  const maxY = Math.max(0, (height as number) - size);
  return {
    x: Math.min(Math.max(0, position.x), maxX),
    y: Math.min(Math.max(0, position.y), maxY),
  };
}
