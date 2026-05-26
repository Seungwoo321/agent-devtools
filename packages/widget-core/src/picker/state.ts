/**
 * Pure state machine for the DOM element picker. The wiring layer
 * (`./picker.ts`) translates real DOM events into `PickerEvent`s and feeds
 * them to `reduce`. Keeping the logic pure makes it auditable: every
 * permitted transition is covered by a test, with no DOM dependency.
 */

export type PickerStatus = 'idle' | 'active' | 'picked';

export interface PickerState {
  readonly status: PickerStatus;
  readonly hovered: Element | null;
  readonly picked: Element | null;
}

export type PickerEvent =
  | { type: 'start' }
  | { type: 'hover'; target: Element | null }
  | { type: 'pick'; target: Element }
  | { type: 'cancel' }
  | { type: 'release' };

export const initialPickerState: PickerState = {
  status: 'idle',
  hovered: null,
  picked: null,
};

/**
 * Compute the next state. Invalid transitions are no-ops — for example,
 * hover events received while idle are ignored, so a stray mousemove can't
 * trip the picker on. This is intentional: callers shouldn't be required to
 * filter events by status.
 */
export function reduce(state: PickerState, event: PickerEvent): PickerState {
  switch (event.type) {
    case 'start':
      if (state.status === 'active') return state;
      return { status: 'active', hovered: null, picked: null };
    case 'hover':
      if (state.status !== 'active') return state;
      if (state.hovered === event.target) return state;
      return { ...state, hovered: event.target };
    case 'pick':
      if (state.status !== 'active') return state;
      return { status: 'picked', hovered: null, picked: event.target };
    case 'cancel':
      if (state.status === 'idle') return state;
      return initialPickerState;
    case 'release':
      if (state.status !== 'picked') return state;
      return initialPickerState;
  }
}
