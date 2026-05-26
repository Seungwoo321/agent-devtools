/**
 * Pure state machine for the floating launcher button. The wiring layer
 * (`./launcher.ts`) translates real pointer events into `LauncherEvent`s and
 * applies the resulting state to the DOM. Keeping the logic pure makes
 * click-vs-drag discrimination, viewport clamping and drag delta math
 * testable without DOM.
 *
 * Coordinate convention: positions are an offset from the launcher's anchor
 * corner. The wiring layer uses anchor=bottom-right, so positive `x` moves
 * the button leftward from the right edge and positive `y` moves it upward
 * from the bottom edge.
 */
export interface LauncherPosition {
  readonly x: number;
  readonly y: number;
}

interface DragSession {
  readonly startClient: LauncherPosition;
  readonly startPosition: LauncherPosition;
  readonly moved: boolean;
}

export interface LauncherState {
  readonly position: LauncherPosition;
  readonly drag: DragSession | null;
}

export type LauncherEvent =
  | { type: 'pointer-down'; client: LauncherPosition }
  | { type: 'pointer-move'; client: LauncherPosition }
  | { type: 'pointer-up' }
  | { type: 'pointer-cancel' }
  | { type: 'set-position'; position: LauncherPosition };

export type LauncherEffect = { type: 'click' } | { type: 'drag-end'; position: LauncherPosition };

export interface LauncherTransition {
  readonly state: LauncherState;
  readonly effect?: LauncherEffect;
}

export interface LauncherReducerOptions {
  /** Pixels of pointer travel before a press becomes a drag. Default 5. */
  readonly dragThreshold?: number;
}

const DEFAULT_DRAG_THRESHOLD = 5;

export function createInitialLauncherState(position: LauncherPosition): LauncherState {
  return { position, drag: null };
}

/**
 * Compute the next state and any side-effect the wiring layer should run.
 * Invalid transitions are no-ops — a `pointer-move` outside of an active
 * press is dropped, so the caller doesn't need to filter listeners.
 */
export function reduce(
  state: LauncherState,
  event: LauncherEvent,
  options: LauncherReducerOptions = {},
): LauncherTransition {
  const threshold = options.dragThreshold ?? DEFAULT_DRAG_THRESHOLD;
  switch (event.type) {
    case 'pointer-down':
      if (state.drag) return { state };
      return {
        state: {
          position: state.position,
          drag: { startClient: event.client, startPosition: state.position, moved: false },
        },
      };
    case 'pointer-move': {
      if (!state.drag) return { state };
      const dx = event.client.x - state.drag.startClient.x;
      const dy = event.client.y - state.drag.startClient.y;
      const moved = state.drag.moved || Math.hypot(dx, dy) >= threshold;
      // Bottom-right anchor: pointer moving right decreases offset, pointer
      // moving down decreases offset. We persist position in anchor offsets
      // so window resize doesn't strand the button off-screen.
      const nextPosition: LauncherPosition = moved
        ? { x: state.drag.startPosition.x - dx, y: state.drag.startPosition.y - dy }
        : state.position;
      return {
        state: {
          position: nextPosition,
          drag: { ...state.drag, moved },
        },
      };
    }
    case 'pointer-up': {
      if (!state.drag) return { state };
      const wasDrag = state.drag.moved;
      const finalPosition = state.position;
      return {
        state: { position: finalPosition, drag: null },
        effect: wasDrag ? { type: 'drag-end', position: finalPosition } : { type: 'click' },
      };
    }
    case 'pointer-cancel': {
      if (!state.drag) return { state };
      // Cancel restores the pre-press position to avoid stranding the button
      // mid-drag when the OS steals the pointer (window blur, touch cancel).
      return { state: { position: state.drag.startPosition, drag: null } };
    }
    case 'set-position':
      if (state.drag) return { state };
      return { state: { position: event.position, drag: null } };
  }
}
