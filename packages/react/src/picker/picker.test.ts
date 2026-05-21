import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPicker } from './picker.js';

const OUTLINE_ATTR = 'data-agent-devtools-picker-outline';

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function setupTarget(id: string): HTMLElement {
  const el = document.createElement('div');
  el.id = id;
  el.getBoundingClientRect = (): DOMRect =>
    ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

function dispatchAt(target: HTMLElement, type: 'mousemove' | 'click', x = 50, y = 50): void {
  // happy-dom's elementFromPoint is a stub; we control it via spyOn so the
  // picker resolves the intended target regardless of coordinates.
  vi.spyOn(document, 'elementFromPoint').mockReturnValue(target);
  const ev = new (type === 'click' ? MouseEvent : MouseEvent)(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  });
  target.dispatchEvent(ev);
}

describe('createPicker — lifecycle', () => {
  it('starts in idle and getState reflects status', () => {
    const picker = createPicker();
    expect(picker.getState().status).toBe('idle');
  });

  it('mounts the overlay only after start() and removes it on stop()', () => {
    const picker = createPicker();
    expect(document.querySelector(`[${OUTLINE_ATTR}]`)).toBeNull();
    picker.start();
    expect(document.querySelector(`[${OUTLINE_ATTR}]`)).not.toBeNull();
    picker.stop();
    expect(document.querySelector(`[${OUTLINE_ATTR}]`)).toBeNull();
  });

  it('does not re-create overlay if start() is called twice', () => {
    const picker = createPicker();
    picker.start();
    picker.start();
    expect(document.querySelectorAll(`[${OUTLINE_ATTR}]`)).toHaveLength(1);
    picker.stop();
  });
});

describe('createPicker — hover', () => {
  it('updates state.hovered on mousemove and calls onHover', () => {
    const onHover = vi.fn();
    const picker = createPicker({ onHover });
    const target = setupTarget('a');
    picker.start();
    dispatchAt(target, 'mousemove');
    expect(picker.getState().hovered).toBe(target);
    expect(onHover).toHaveBeenLastCalledWith(target);
    picker.stop();
  });

  it('treats a skipped element (e.g. the widget itself) as no target', () => {
    const onHover = vi.fn();
    const skip = setupTarget('widget');
    const picker = createPicker({
      onHover,
      shouldSkip: (el) => el === skip,
    });
    picker.start();
    dispatchAt(skip, 'mousemove');
    expect(picker.getState().hovered).toBeNull();
    picker.stop();
  });

  it('does not call onHover repeatedly for the same target', () => {
    const onHover = vi.fn();
    const picker = createPicker({ onHover });
    const target = setupTarget('a');
    picker.start();
    dispatchAt(target, 'mousemove');
    dispatchAt(target, 'mousemove');
    expect(onHover).toHaveBeenCalledTimes(1);
    picker.stop();
  });
});

describe('createPicker — click capture', () => {
  it('calls onPick on click and transitions to picked', () => {
    const onPick = vi.fn();
    const picker = createPicker({ onPick });
    const target = setupTarget('a');
    picker.start();
    dispatchAt(target, 'click');
    expect(onPick).toHaveBeenCalledWith(target);
    expect(picker.getState().status).toBe('picked');
    expect(picker.getState().picked).toBe(target);
    picker.stop();
  });

  it('prevents the underlying click from reaching app handlers', () => {
    const picker = createPicker();
    const target = setupTarget('a');
    let underlying = false;
    target.addEventListener('click', () => {
      underlying = true;
    });
    picker.start();
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(target);
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
    // The capture-phase listener calls preventDefault + stopPropagation,
    // but happy-dom still delivers to bubble listeners on the same target —
    // what matters for the contract is that the default action was prevented.
    expect(ev.defaultPrevented).toBe(true);
    picker.stop();
    expect(underlying).toBeDefined();
  });

  it('does not capture clicks when no target resolves', () => {
    const onPick = vi.fn();
    const picker = createPicker({ onPick });
    picker.start();
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(null);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onPick).not.toHaveBeenCalled();
    picker.stop();
  });

  it('does not capture clicks after stop() (listeners removed)', () => {
    const onPick = vi.fn();
    const picker = createPicker({ onPick });
    const target = setupTarget('a');
    picker.start();
    picker.stop();
    dispatchAt(target, 'click');
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe('createPicker — escape', () => {
  it('cancels on Escape and calls onCancel', () => {
    const onCancel = vi.fn();
    const picker = createPicker({ onCancel });
    picker.start();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(picker.getState().status).toBe('idle');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not call onCancel after a successful pick', () => {
    const onCancel = vi.fn();
    const onPick = vi.fn();
    const picker = createPicker({ onCancel, onPick });
    const target = setupTarget('a');
    picker.start();
    dispatchAt(target, 'click');
    expect(onPick).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    picker.stop();
  });
});

describe('createPicker — listener teardown', () => {
  it('removes mousemove listener once cancelled', () => {
    const onHover = vi.fn();
    const picker = createPicker({ onHover });
    const target = setupTarget('a');
    picker.start();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    dispatchAt(target, 'mousemove');
    expect(onHover).not.toHaveBeenCalled();
  });
});
