import { describe, expect, it } from 'vitest';
import { initialPickerState, reduce, type PickerState } from './state.js';

const ELEMENT_A = { tagName: 'A' } as unknown as Element;
const ELEMENT_B = { tagName: 'B' } as unknown as Element;

describe('reduce', () => {
  describe('start', () => {
    it('moves idle → active and clears stale hovered / picked', () => {
      const start: PickerState = { status: 'idle', hovered: ELEMENT_A, picked: ELEMENT_B };
      expect(reduce(start, { type: 'start' })).toEqual({
        status: 'active',
        hovered: null,
        picked: null,
      });
    });

    it('is a no-op when already active', () => {
      const active: PickerState = { status: 'active', hovered: ELEMENT_A, picked: null };
      expect(reduce(active, { type: 'start' })).toBe(active);
    });
  });

  describe('hover', () => {
    it('updates hovered while active', () => {
      const next = reduce(
        { status: 'active', hovered: null, picked: null },
        { type: 'hover', target: ELEMENT_A },
      );
      expect(next.hovered).toBe(ELEMENT_A);
      expect(next.status).toBe('active');
    });

    it('is a no-op when hovering the same element again (identity check)', () => {
      const state: PickerState = { status: 'active', hovered: ELEMENT_A, picked: null };
      expect(reduce(state, { type: 'hover', target: ELEMENT_A })).toBe(state);
    });

    it('accepts hover(null) to clear the outline', () => {
      const state: PickerState = { status: 'active', hovered: ELEMENT_A, picked: null };
      const next = reduce(state, { type: 'hover', target: null });
      expect(next.hovered).toBeNull();
    });

    it('is a no-op when idle (stray mousemove cannot leak in)', () => {
      const idle = initialPickerState;
      expect(reduce(idle, { type: 'hover', target: ELEMENT_A })).toBe(idle);
    });

    it('is a no-op once picked (hover after capture is ignored)', () => {
      const picked: PickerState = { status: 'picked', hovered: null, picked: ELEMENT_A };
      expect(reduce(picked, { type: 'hover', target: ELEMENT_B })).toBe(picked);
    });
  });

  describe('pick', () => {
    it('moves active → picked with the captured element', () => {
      const next = reduce(
        { status: 'active', hovered: ELEMENT_A, picked: null },
        { type: 'pick', target: ELEMENT_A },
      );
      expect(next).toEqual({ status: 'picked', hovered: null, picked: ELEMENT_A });
    });

    it('clears the hovered element when capturing', () => {
      const next = reduce(
        { status: 'active', hovered: ELEMENT_B, picked: null },
        { type: 'pick', target: ELEMENT_A },
      );
      expect(next.hovered).toBeNull();
    });

    it('is a no-op when idle (cannot pick without start)', () => {
      const idle = initialPickerState;
      expect(reduce(idle, { type: 'pick', target: ELEMENT_A })).toBe(idle);
    });

    it('is a no-op when already picked (second click does nothing)', () => {
      const picked: PickerState = { status: 'picked', hovered: null, picked: ELEMENT_A };
      expect(reduce(picked, { type: 'pick', target: ELEMENT_B })).toBe(picked);
    });
  });

  describe('cancel', () => {
    it('returns to idle from active', () => {
      const state: PickerState = { status: 'active', hovered: ELEMENT_A, picked: null };
      expect(reduce(state, { type: 'cancel' })).toEqual(initialPickerState);
    });

    it('returns to idle from picked', () => {
      const state: PickerState = { status: 'picked', hovered: null, picked: ELEMENT_A };
      expect(reduce(state, { type: 'cancel' })).toEqual(initialPickerState);
    });

    it('is a no-op when already idle', () => {
      expect(reduce(initialPickerState, { type: 'cancel' })).toBe(initialPickerState);
    });
  });

  describe('release', () => {
    it('returns to idle from picked', () => {
      const state: PickerState = { status: 'picked', hovered: null, picked: ELEMENT_A };
      expect(reduce(state, { type: 'release' })).toEqual(initialPickerState);
    });

    it('is a no-op from active (release only valid after pick)', () => {
      const state: PickerState = { status: 'active', hovered: ELEMENT_A, picked: null };
      expect(reduce(state, { type: 'release' })).toBe(state);
    });
  });
});
