import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createOverlay } from './overlay.js';

const OUTLINE_ATTR = 'data-agent-devtools-picker-outline';

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('createOverlay', () => {
  it('appends an outline div to <body> with the marker attribute', () => {
    const overlay = createOverlay();
    const found = document.querySelectorAll(`[${OUTLINE_ATTR}]`);
    expect(found).toHaveLength(1);
    overlay.destroy();
  });

  it('applies pointer-events: none so it does not intercept clicks', () => {
    createOverlay();
    const node = document.querySelector(`[${OUTLINE_ATTR}]`) as HTMLElement;
    expect(node.style.pointerEvents).toBe('none');
  });

  it('starts hidden (display: none)', () => {
    createOverlay();
    const node = document.querySelector(`[${OUTLINE_ATTR}]`) as HTMLElement;
    expect(node.style.display).toBe('none');
  });

  it('positions and sizes itself over the target on show()', () => {
    const target = document.createElement('div');
    target.getBoundingClientRect = (): DOMRect =>
      ({ left: 10, top: 20, width: 100, height: 50, right: 110, bottom: 70 }) as DOMRect;
    document.body.appendChild(target);

    const overlay = createOverlay();
    overlay.show(target);

    const node = document.querySelector(`[${OUTLINE_ATTR}]`) as HTMLElement;
    expect(node.style.display).toBe('block');
    // happy-dom returns scrollX/scrollY as 0, so transform is the rect's left/top.
    expect(node.style.transform).toBe('translate(10px, 20px)');
    expect(node.style.width).toBe('100px');
    expect(node.style.height).toBe('50px');
  });

  it('hides itself when show(null) is called', () => {
    const target = document.createElement('div');
    target.getBoundingClientRect = (): DOMRect =>
      ({ left: 0, top: 0, width: 1, height: 1, right: 1, bottom: 1 }) as DOMRect;
    document.body.appendChild(target);

    const overlay = createOverlay();
    overlay.show(target);
    overlay.show(null);

    const node = document.querySelector(`[${OUTLINE_ATTR}]`) as HTMLElement;
    expect(node.style.display).toBe('none');
  });

  it('removes the node on destroy()', () => {
    const overlay = createOverlay();
    overlay.destroy();
    expect(document.querySelector(`[${OUTLINE_ATTR}]`)).toBeNull();
  });

  it('is safe to call destroy() multiple times', () => {
    const overlay = createOverlay();
    overlay.destroy();
    expect(() => overlay.destroy()).not.toThrow();
  });

  it('ignores show() after destroy() (no resurrection)', () => {
    const target = document.createElement('div');
    target.getBoundingClientRect = (): DOMRect =>
      ({ left: 0, top: 0, width: 1, height: 1, right: 1, bottom: 1 }) as DOMRect;
    document.body.appendChild(target);

    const overlay = createOverlay();
    overlay.destroy();
    overlay.show(target);

    expect(document.querySelector(`[${OUTLINE_ATTR}]`)).toBeNull();
  });

  it('uses the configured outline color', () => {
    createOverlay({ color: 'red' });
    const node = document.querySelector(`[${OUTLINE_ATTR}]`) as HTMLElement;
    expect(node.style.border).toContain('red');
  });
});
