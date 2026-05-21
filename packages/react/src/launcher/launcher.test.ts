import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLauncher } from './launcher.js';
import { DEFAULT_LAUNCHER_STORAGE_KEY } from './storage.js';

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length(): number {
      return map.size;
    },
    clear(): void {
      map.clear();
    },
    getItem(key: string): string | null {
      return map.get(key) ?? null;
    },
    key(index: number): string | null {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      map.delete(key);
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
  };
}

function pointerEvent(
  type: string,
  options: { clientX?: number; clientY?: number; pointerId?: number; button?: number } = {},
): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: options.clientX ?? 0,
    clientY: options.clientY ?? 0,
    pointerId: options.pointerId ?? 1,
    button: options.button ?? 0,
  });
}

let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('createLauncher', () => {
  it('renders a button into the container with default position', () => {
    const handle = createLauncher({ container, storage: makeStorage() });
    expect(handle.element.parentElement).toBe(container);
    expect(handle.element.tagName).toBe('BUTTON');
    expect(handle.element.style.right).toBe('24px');
    expect(handle.element.style.bottom).toBe('24px');
    expect(handle.element.getAttribute('aria-label')).toBe('Open agent devtools');
    handle.destroy();
  });

  it('restores a previously persisted position', () => {
    const storage = makeStorage();
    storage.setItem(DEFAULT_LAUNCHER_STORAGE_KEY, JSON.stringify({ x: 100, y: 200 }));
    const handle = createLauncher({ container, storage });
    expect(handle.element.style.right).toBe('100px');
    expect(handle.element.style.bottom).toBe('200px');
    handle.destroy();
  });

  it('clamps the restored position to the live viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 200 });
    const storage = makeStorage();
    storage.setItem(DEFAULT_LAUNCHER_STORAGE_KEY, JSON.stringify({ x: 9000, y: 9000 }));
    const handle = createLauncher({ container, storage, sizePx: 48 });
    expect(handle.element.style.right).toBe('152px');
    expect(handle.element.style.bottom).toBe('152px');
    handle.destroy();
  });

  it('fires onClick when pointer-up follows pointer-down without movement', () => {
    const onClick = vi.fn();
    const handle = createLauncher({ container, storage: makeStorage(), onClick });
    handle.element.dispatchEvent(pointerEvent('pointerdown', { clientX: 50, clientY: 50 }));
    handle.element.dispatchEvent(pointerEvent('pointerup', { clientX: 50, clientY: 50 }));
    expect(onClick).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it('fires onDragEnd (not onClick) when pointer moves past the threshold', () => {
    const onClick = vi.fn();
    const onDragEnd = vi.fn();
    const storage = makeStorage();
    const handle = createLauncher({ container, storage, onClick, onDragEnd });
    handle.element.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
    handle.element.dispatchEvent(pointerEvent('pointermove', { clientX: 150, clientY: 100 }));
    handle.element.dispatchEvent(pointerEvent('pointerup', { clientX: 150, clientY: 100 }));
    expect(onClick).not.toHaveBeenCalled();
    expect(onDragEnd).toHaveBeenCalledTimes(1);
    // bottom-right anchor: dragging 50px right reduces x-offset by 50 (default x=24 → -26 → clamped to 0)
    expect(handle.element.style.right).toBe('0px');
    expect(JSON.parse(storage.getItem(DEFAULT_LAUNCHER_STORAGE_KEY) ?? 'null')).toEqual({
      x: 0,
      y: 24,
    });
    handle.destroy();
  });

  it('does not start a press for non-primary buttons', () => {
    const onClick = vi.fn();
    const handle = createLauncher({ container, storage: makeStorage(), onClick });
    handle.element.dispatchEvent(
      pointerEvent('pointerdown', { clientX: 0, clientY: 0, button: 2 }),
    );
    handle.element.dispatchEvent(pointerEvent('pointerup', { clientX: 0, clientY: 0 }));
    expect(onClick).not.toHaveBeenCalled();
    handle.destroy();
  });

  it('pointer-cancel discards the drag and restores the start position', () => {
    const onDragEnd = vi.fn();
    const handle = createLauncher({ container, storage: makeStorage(), onDragEnd });
    handle.element.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
    handle.element.dispatchEvent(pointerEvent('pointermove', { clientX: 200, clientY: 100 }));
    handle.element.dispatchEvent(pointerEvent('pointercancel', { clientX: 200, clientY: 100 }));
    expect(onDragEnd).not.toHaveBeenCalled();
    expect(handle.element.style.right).toBe('24px');
    expect(handle.element.style.bottom).toBe('24px');
    handle.destroy();
  });

  it('setPosition clamps + persists + applies styles', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    const storage = makeStorage();
    const handle = createLauncher({ container, storage, sizePx: 48 });
    handle.setPosition({ x: -50, y: 300 });
    expect(handle.element.style.right).toBe('0px');
    expect(handle.element.style.bottom).toBe('300px');
    expect(JSON.parse(storage.getItem(DEFAULT_LAUNCHER_STORAGE_KEY) ?? 'null')).toEqual({
      x: 0,
      y: 300,
    });
    handle.destroy();
  });

  it('destroy removes the button and is idempotent', () => {
    const handle = createLauncher({ container, storage: makeStorage() });
    handle.destroy();
    expect(container.children.length).toBe(0);
    expect(() => handle.destroy()).not.toThrow();
  });

  it('destroy stops further events from firing callbacks', () => {
    const onClick = vi.fn();
    const handle = createLauncher({ container, storage: makeStorage(), onClick });
    const btn = handle.element;
    handle.destroy();
    btn.dispatchEvent(pointerEvent('pointerdown', { clientX: 0, clientY: 0 }));
    btn.dispatchEvent(pointerEvent('pointerup', { clientX: 0, clientY: 0 }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('respects custom defaultPosition when nothing is stored', () => {
    const handle = createLauncher({
      container,
      storage: makeStorage(),
      defaultPosition: { x: 48, y: 72 },
    });
    expect(handle.element.style.right).toBe('48px');
    expect(handle.element.style.bottom).toBe('72px');
    handle.destroy();
  });

  it('fires onPositionChange with the initial position on mount', () => {
    const onPositionChange = vi.fn();
    const handle = createLauncher({ container, storage: makeStorage(), onPositionChange });
    expect(onPositionChange).toHaveBeenCalledTimes(1);
    expect(onPositionChange).toHaveBeenLastCalledWith({ x: 24, y: 24 });
    handle.destroy();
  });

  it('fires onPositionChange on every drag move and on the final clamp', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    const onPositionChange = vi.fn();
    const handle = createLauncher({
      container,
      storage: makeStorage(),
      onPositionChange,
      defaultPosition: { x: 100, y: 100 },
    });
    onPositionChange.mockClear();
    handle.element.dispatchEvent(pointerEvent('pointerdown', { clientX: 50, clientY: 50 }));
    handle.element.dispatchEvent(pointerEvent('pointermove', { clientX: 80, clientY: 70 }));
    handle.element.dispatchEvent(pointerEvent('pointerup', { clientX: 80, clientY: 70 }));
    expect(onPositionChange.mock.calls.length).toBeGreaterThanOrEqual(1);
    handle.destroy();
  });

  it('fires onPositionChange when setPosition is called programmatically', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    const onPositionChange = vi.fn();
    const handle = createLauncher({ container, storage: makeStorage(), onPositionChange });
    onPositionChange.mockClear();
    handle.setPosition({ x: 200, y: 300 });
    expect(onPositionChange).toHaveBeenCalledWith({ x: 200, y: 300 });
    handle.destroy();
  });

  it('uses a custom storage key', () => {
    const storage = makeStorage();
    const handle = createLauncher({ container, storage, key: 'custom' });
    handle.element.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
    handle.element.dispatchEvent(pointerEvent('pointermove', { clientX: 150, clientY: 100 }));
    handle.element.dispatchEvent(pointerEvent('pointerup', { clientX: 150, clientY: 100 }));
    expect(storage.getItem('custom')).not.toBeNull();
    expect(storage.getItem(DEFAULT_LAUNCHER_STORAGE_KEY)).toBeNull();
    handle.destroy();
  });
});
