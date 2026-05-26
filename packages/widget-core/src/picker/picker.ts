import { createOverlay, type OverlayHandle } from './overlay.js';
import { initialPickerState, reduce, type PickerEvent, type PickerState } from './state.js';

/**
 * High-level picker: hover outline that follows the pointer, click to
 * capture, Escape to cancel. Designed for the agent widget to drop in:
 *
 *   const picker = createPicker({ onPick: (el) => widget.attach(el) });
 *   picker.start();
 *
 * The picker registers global listeners only while active. `stop()` removes
 * them and disposes the overlay. Callers should treat the picker as
 * single-use per UI flow: instantiate, start, react to the callback, stop.
 */

export interface PickerCallbacks {
  /** Called with the final picked element. */
  onPick?: (target: Element) => void;
  /** Called when the user cancels (Escape, or `cancel()`). */
  onCancel?: () => void;
  /** Called whenever the hovered element changes. Useful for live previews. */
  onHover?: (target: Element | null) => void;
}

export interface PickerOptions extends PickerCallbacks {
  /** Document to attach to. Defaults to `globalThis.document`. */
  document?: Document;
  /**
   * Predicate that returns `true` for elements the picker should treat as
   * "not pickable" — the agent widget's own DOM, for example. When the
   * pointer is over a skipped element the picker hides its outline.
   */
  shouldSkip?: (target: Element) => boolean;
  /** Outline color override. */
  color?: string;
}

export interface Picker {
  start(): void;
  stop(): void;
  cancel(): void;
  /** Snapshot of the current state — mostly for tests / debugging. */
  getState(): PickerState;
}

export function createPicker(options: PickerOptions = {}): Picker {
  const doc = options.document ?? globalThis.document;
  let state: PickerState = initialPickerState;
  let overlay: OverlayHandle | null = null;
  let attached = false;

  function dispatch(event: PickerEvent): void {
    const next = reduce(state, event);
    if (next === state) return;
    const prev = state;
    state = next;
    onTransition(prev, next);
  }

  function onTransition(prev: PickerState, next: PickerState): void {
    if (next.hovered !== prev.hovered) {
      overlay?.show(next.hovered);
      options.onHover?.(next.hovered);
    }
    if (next.status === 'picked' && next.picked && prev.status !== 'picked') {
      options.onPick?.(next.picked);
    }
    if (prev.status !== 'idle' && next.status === 'idle') {
      // Either cancel or release. Distinguish by whether we had picked.
      if (prev.status === 'active') options.onCancel?.();
    }
    if (next.status === 'idle' && attached) {
      detachListeners();
    }
  }

  function onMouseMove(e: MouseEvent): void {
    if (state.status !== 'active') return;
    const target = resolveTarget(e);
    dispatch({ type: 'hover', target });
  }

  function onClick(e: MouseEvent): void {
    if (state.status !== 'active') return;
    const target = resolveTarget(e);
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    dispatch({ type: 'pick', target });
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    if (state.status === 'idle') return;
    e.preventDefault();
    dispatch({ type: 'cancel' });
  }

  function resolveTarget(e: MouseEvent): Element | null {
    const view = doc.defaultView;
    const point =
      view && typeof doc.elementFromPoint === 'function'
        ? doc.elementFromPoint(e.clientX, e.clientY)
        : (e.target as Element | null);
    if (!point) return null;
    if (options.shouldSkip?.(point)) return null;
    return point;
  }

  function attachListeners(): void {
    if (attached) return;
    attached = true;
    doc.addEventListener('mousemove', onMouseMove, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('keydown', onKeyDown, true);
  }

  function detachListeners(): void {
    if (!attached) return;
    attached = false;
    doc.removeEventListener('mousemove', onMouseMove, true);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('keydown', onKeyDown, true);
  }

  return {
    start(): void {
      if (state.status === 'active') return;
      overlay = createOverlay({
        document: doc,
        ...(options.color !== undefined && { color: options.color }),
      });
      attachListeners();
      dispatch({ type: 'start' });
    },
    stop(): void {
      detachListeners();
      overlay?.destroy();
      overlay = null;
      state = initialPickerState;
    },
    cancel(): void {
      dispatch({ type: 'cancel' });
      overlay?.destroy();
      overlay = null;
    },
    getState(): PickerState {
      return state;
    },
  };
}
