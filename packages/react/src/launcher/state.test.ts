import { describe, expect, it } from 'vitest';
import { createInitialLauncherState, reduce } from './state.js';

describe('launcher state machine', () => {
  it('starts a drag session on pointer-down without changing position', () => {
    const s0 = createInitialLauncherState({ x: 24, y: 24 });
    const { state, effect } = reduce(s0, { type: 'pointer-down', client: { x: 100, y: 200 } });
    expect(state.drag).toEqual({
      startClient: { x: 100, y: 200 },
      startPosition: { x: 24, y: 24 },
      moved: false,
    });
    expect(state.position).toEqual({ x: 24, y: 24 });
    expect(effect).toBeUndefined();
  });

  it('ignores additional pointer-down while a drag is active', () => {
    const s0 = createInitialLauncherState({ x: 0, y: 0 });
    const s1 = reduce(s0, { type: 'pointer-down', client: { x: 10, y: 10 } }).state;
    const s2 = reduce(s1, { type: 'pointer-down', client: { x: 99, y: 99 } }).state;
    expect(s2).toBe(s1);
  });

  it('ignores pointer-move when there is no active press', () => {
    const s0 = createInitialLauncherState({ x: 0, y: 0 });
    const out = reduce(s0, { type: 'pointer-move', client: { x: 50, y: 50 } });
    expect(out.state).toBe(s0);
    expect(out.effect).toBeUndefined();
  });

  it('keeps the press un-moved within the drag threshold', () => {
    const s0 = createInitialLauncherState({ x: 24, y: 24 });
    const pressed = reduce(s0, { type: 'pointer-down', client: { x: 100, y: 100 } }).state;
    const moved = reduce(pressed, { type: 'pointer-move', client: { x: 102, y: 103 } }).state;
    expect(moved.drag?.moved).toBe(false);
    expect(moved.position).toEqual({ x: 24, y: 24 });
  });

  it('flips the press into a drag once the threshold is exceeded', () => {
    const s0 = createInitialLauncherState({ x: 24, y: 24 });
    const pressed = reduce(s0, { type: 'pointer-down', client: { x: 100, y: 100 } }).state;
    const dragged = reduce(pressed, { type: 'pointer-move', client: { x: 110, y: 100 } }).state;
    expect(dragged.drag?.moved).toBe(true);
    // bottom-right anchor: pointer +10 in x reduces x-offset by 10
    expect(dragged.position).toEqual({ x: 14, y: 24 });
  });

  it('subtracts pointer delta from the start position with bottom-right anchor math', () => {
    const s0 = createInitialLauncherState({ x: 100, y: 100 });
    const pressed = reduce(s0, { type: 'pointer-down', client: { x: 200, y: 200 } }).state;
    const left = reduce(pressed, { type: 'pointer-move', client: { x: 180, y: 220 } }).state;
    expect(left.position).toEqual({ x: 120, y: 80 });
  });

  it('emits click effect on pointer-up when no drag occurred', () => {
    const s0 = createInitialLauncherState({ x: 24, y: 24 });
    const pressed = reduce(s0, { type: 'pointer-down', client: { x: 100, y: 100 } }).state;
    const tiny = reduce(pressed, { type: 'pointer-move', client: { x: 101, y: 101 } }).state;
    const out = reduce(tiny, { type: 'pointer-up' });
    expect(out.effect).toEqual({ type: 'click' });
    expect(out.state.drag).toBeNull();
    expect(out.state.position).toEqual({ x: 24, y: 24 });
  });

  it('emits drag-end effect on pointer-up when drag occurred', () => {
    const s0 = createInitialLauncherState({ x: 24, y: 24 });
    const pressed = reduce(s0, { type: 'pointer-down', client: { x: 100, y: 100 } }).state;
    const dragged = reduce(pressed, { type: 'pointer-move', client: { x: 150, y: 100 } }).state;
    const out = reduce(dragged, { type: 'pointer-up' });
    expect(out.effect).toEqual({ type: 'drag-end', position: { x: -26, y: 24 } });
    expect(out.state.drag).toBeNull();
  });

  it('ignores pointer-up outside of an active press', () => {
    const s0 = createInitialLauncherState({ x: 24, y: 24 });
    const out = reduce(s0, { type: 'pointer-up' });
    expect(out.state).toBe(s0);
    expect(out.effect).toBeUndefined();
  });

  it('pointer-cancel restores the pre-press position', () => {
    const s0 = createInitialLauncherState({ x: 24, y: 24 });
    const pressed = reduce(s0, { type: 'pointer-down', client: { x: 100, y: 100 } }).state;
    const dragged = reduce(pressed, { type: 'pointer-move', client: { x: 999, y: 999 } }).state;
    expect(dragged.position).not.toEqual({ x: 24, y: 24 });
    const cancelled = reduce(dragged, { type: 'pointer-cancel' });
    expect(cancelled.state.position).toEqual({ x: 24, y: 24 });
    expect(cancelled.state.drag).toBeNull();
    expect(cancelled.effect).toBeUndefined();
  });

  it('respects custom dragThreshold', () => {
    const s0 = createInitialLauncherState({ x: 0, y: 0 });
    const pressed = reduce(s0, { type: 'pointer-down', client: { x: 0, y: 0 } }).state;
    const small = reduce(
      pressed,
      { type: 'pointer-move', client: { x: 12, y: 0 } },
      { dragThreshold: 20 },
    ).state;
    expect(small.drag?.moved).toBe(false);
    const big = reduce(
      pressed,
      { type: 'pointer-move', client: { x: 21, y: 0 } },
      { dragThreshold: 20 },
    ).state;
    expect(big.drag?.moved).toBe(true);
  });

  it('set-position updates position directly when not dragging', () => {
    const s0 = createInitialLauncherState({ x: 24, y: 24 });
    const out = reduce(s0, { type: 'set-position', position: { x: 200, y: 400 } });
    expect(out.state.position).toEqual({ x: 200, y: 400 });
  });

  it('set-position is ignored mid-drag', () => {
    const s0 = createInitialLauncherState({ x: 24, y: 24 });
    const pressed = reduce(s0, { type: 'pointer-down', client: { x: 0, y: 0 } }).state;
    const out = reduce(pressed, { type: 'set-position', position: { x: 999, y: 999 } });
    expect(out.state).toBe(pressed);
  });
});
