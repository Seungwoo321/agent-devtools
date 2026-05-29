import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createComposer, CHIP_BG, CHIP_BORDER } from './composer.js';
import type { PickedEvidence } from '../context/types.js';

let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  document.body.innerHTML = '';
});

function makePicked(overrides: Partial<PickedEvidence> = {}): PickedEvidence {
  return {
    componentName: 'Button',
    tagName: 'BUTTON',
    selector: '#go',
    outerHTML: '<button id="go">Go</button>',
    attributes: { id: 'go' },
    componentChain: [],
    ...overrides,
  };
}

function getTextarea(panel: HTMLElement): HTMLTextAreaElement {
  return panel.querySelector('textarea') as HTMLTextAreaElement;
}

function getSendButton(panel: HTMLElement): HTMLButtonElement {
  return panel.querySelector('[data-agent-devtools-composer-send]') as HTMLButtonElement;
}

function getPickButton(panel: HTMLElement): HTMLButtonElement {
  return panel.querySelector('[data-agent-devtools-composer-pick]') as HTMLButtonElement;
}

function getCloseButton(panel: HTMLElement): HTMLButtonElement {
  return panel.querySelector('[data-agent-devtools-composer-close]') as HTMLButtonElement;
}

function getChipHost(panel: HTMLElement): HTMLElement {
  return panel.querySelector('[data-agent-devtools-composer-chip]') as HTMLElement;
}

describe('createComposer', () => {
  it('mounts a hidden panel by default', () => {
    const handle = createComposer({ container, onSubmit: vi.fn() });
    expect(handle.element.parentElement).toBe(container);
    expect(handle.element.style.display).toBe('none');
    handle.destroy();
  });

  it('starts visible when visible: true', () => {
    const handle = createComposer({ container, onSubmit: vi.fn(), visible: true });
    expect(handle.element.style.display).toBe('flex');
    handle.destroy();
  });

  it('disables the send button when text is empty', () => {
    const handle = createComposer({ container, onSubmit: vi.fn() });
    expect(getSendButton(handle.element).disabled).toBe(true);
    handle.destroy();
  });

  it('enables the send button once the textarea has non-whitespace text', () => {
    const handle = createComposer({ container, onSubmit: vi.fn() });
    const ta = getTextarea(handle.element);
    ta.value = '   ';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    expect(getSendButton(handle.element).disabled).toBe(true);
    ta.value = 'hello';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    expect(getSendButton(handle.element).disabled).toBe(false);
    handle.destroy();
  });

  it('Enter without Shift submits with text + picked', () => {
    const onSubmit = vi.fn();
    const picked = makePicked();
    const handle = createComposer({ container, onSubmit, picked });
    const ta = getTextarea(handle.element);
    ta.value = 'why does this button break';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    expect(onSubmit).toHaveBeenCalledWith({
      text: 'why does this button break',
      picked,
    });
    handle.destroy();
  });

  it('Shift+Enter does not submit', () => {
    const onSubmit = vi.fn();
    const handle = createComposer({ container, onSubmit });
    const ta = getTextarea(handle.element);
    ta.value = 'multi';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(onSubmit).not.toHaveBeenCalled();
    handle.destroy();
  });

  it('does not submit whitespace-only text', () => {
    const onSubmit = vi.fn();
    const handle = createComposer({ container, onSubmit });
    const ta = getTextarea(handle.element);
    ta.value = '   ';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    getSendButton(handle.element).click();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onSubmit).not.toHaveBeenCalled();
    handle.destroy();
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    const handle = createComposer({ container, onSubmit: vi.fn(), onClose });
    const ta = getTextarea(handle.element);
    ta.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    const handle = createComposer({ container, onSubmit: vi.fn(), onClose });
    getCloseButton(handle.element).click();
    expect(onClose).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it('pick button toggles via onTogglePicker(!pickerActive)', () => {
    const onTogglePicker = vi.fn();
    const handle = createComposer({
      container,
      onSubmit: vi.fn(),
      onTogglePicker,
      pickerActive: false,
    });
    getPickButton(handle.element).click();
    expect(onTogglePicker).toHaveBeenLastCalledWith(true);
    handle.setPickerActive(true);
    getPickButton(handle.element).click();
    expect(onTogglePicker).toHaveBeenLastCalledWith(false);
    handle.destroy();
  });

  it('renders a chip with componentName when picked is set', () => {
    const handle = createComposer({
      container,
      onSubmit: vi.fn(),
      picked: makePicked({ componentName: 'Header' }),
    });
    const chipHost = getChipHost(handle.element);
    expect(chipHost.textContent ?? '').toContain('Header');
    handle.destroy();
  });

  it('clearing the chip calls onClearPicked', () => {
    const onClearPicked = vi.fn();
    const handle = createComposer({
      container,
      onSubmit: vi.fn(),
      onClearPicked,
      picked: makePicked(),
    });
    const remove = getChipHost(handle.element).querySelector('button') as HTMLButtonElement;
    remove.click();
    expect(onClearPicked).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it('renders the chip with an opaque background so the conversation stream cannot bleed through', () => {
    // The chip fill is now a CSS var() theme token, which the browser resolves
    // but the headless CSS engine drops from inline styles — so the opacity
    // contract is asserted against the source-of-truth constant (the light
    // literal fallback) rather than the un-resolvable rendered value. The dark
    // token's opacity is covered in shadow-root.test.ts.
    // The chip MUST NOT use an alpha-channel background — rgba/hsla with
    // alpha < 1 lets stream text show through. Solid hex / named colors are
    // the contract.
    expect(CHIP_BG.toLowerCase()).not.toMatch(/rgba?\([^)]*0?\.\d/);
    expect(CHIP_BG.toLowerCase()).not.toMatch(/hsla?\([^)]*0?\.\d/);
    expect(CHIP_BG).not.toBe('transparent');
    expect(CHIP_BG).not.toBe('');
    // And the chip should have a visible border so it still reads as a
    // discrete affordance against a similarly-colored panel.
    expect(CHIP_BORDER).not.toBe('');
    // The chip element still actually renders with the marker so the slot is
    // wired up.
    const handle = createComposer({ container, onSubmit: vi.fn(), picked: makePicked() });
    expect(
      handle.element.querySelector('[data-agent-devtools-composer-chip] > span'),
    ).not.toBeNull();
    handle.destroy();
  });

  it('attaches a tooltip element to the chip with the source file:line, component name and chain', () => {
    const picked = makePicked({
      componentName: 'TodoItem',
      tagName: 'LI',
      selector: 'li.todo[data-id="42"]',
      source: { fileName: 'src/components/TodoItem.tsx', lineNumber: 12, columnNumber: 4 },
      componentChain: [
        { componentName: 'TodoItem' },
        { componentName: 'TodoList' },
        { componentName: 'App' },
      ],
    });
    const handle = createComposer({ container, onSubmit: vi.fn(), picked });
    const tooltip = handle.element.querySelector<HTMLElement>(
      '[data-agent-devtools-composer-chip-tooltip]',
    );
    expect(tooltip).not.toBeNull();
    expect(tooltip!.getAttribute('role')).toBe('tooltip');
    const tt = tooltip!.textContent ?? '';
    expect(tt).toContain('TodoItem');
    expect(tt).toContain('<li>');
    expect(tt).toContain('src/components/TodoItem.tsx:12');
    // chain excludes the leaf itself
    expect(tt).toContain('TodoList → App');
    expect(tt).toContain('li.todo[data-id="42"]');
    handle.destroy();
  });

  it('chip does NOT set a native title attribute so only the custom tooltip surfaces on hover', () => {
    const picked = makePicked({
      componentName: 'Button',
      tagName: 'BUTTON',
      source: { fileName: 'src/Button.tsx', lineNumber: 7 },
    });
    const handle = createComposer({ container, onSubmit: vi.fn(), picked });
    const chip = handle.element.querySelector<HTMLElement>(
      '[data-agent-devtools-composer-chip] > span',
    );
    expect(chip?.hasAttribute('title')).toBe(false);
    handle.destroy();
  });

  it('chip tooltip starts hidden and becomes visible on pointerenter', () => {
    const handle = createComposer({ container, onSubmit: vi.fn(), picked: makePicked() });
    const tooltip = handle.element.querySelector<HTMLElement>(
      '[data-agent-devtools-composer-chip-tooltip]',
    )!;
    const chip = tooltip.parentElement!;
    expect(tooltip.style.visibility).toBe('hidden');
    chip.dispatchEvent(new Event('pointerenter', { bubbles: true }));
    expect(tooltip.style.visibility).toBe('visible');
    chip.dispatchEvent(new Event('pointerleave', { bubbles: true }));
    expect(tooltip.style.visibility).toBe('hidden');
    handle.destroy();
  });

  it('chip tooltip surfaces on keyboard focus and hides on blur', () => {
    const handle = createComposer({ container, onSubmit: vi.fn(), picked: makePicked() });
    const chipHost = getChipHost(handle.element);
    const chip = chipHost.querySelector<HTMLElement>('[tabindex="0"]');
    const tooltip = chipHost.querySelector<HTMLElement>(
      '[data-agent-devtools-composer-chip-tooltip]',
    );
    expect(chip).not.toBeNull();
    expect(tooltip).not.toBeNull();
    expect(chip!.getAttribute('aria-describedby')).toBe(tooltip!.getAttribute('id'));
    chip!.dispatchEvent(new FocusEvent('focus'));
    expect(tooltip!.style.visibility).toBe('visible');
    chip!.dispatchEvent(new FocusEvent('blur'));
    expect(tooltip!.style.visibility).toBe('hidden');
    handle.destroy();
  });

  it('chip tooltip omits absent fields gracefully (no source, no chain)', () => {
    const picked = makePicked({
      componentName: '',
      tagName: 'DIV',
      selector: 'div',
      // no source
      componentChain: [],
    });
    const handle = createComposer({ container, onSubmit: vi.fn(), picked });
    const tooltip = handle.element.querySelector<HTMLElement>(
      '[data-agent-devtools-composer-chip-tooltip]',
    )!;
    const tt = tooltip.textContent ?? '';
    expect(tt).toContain('div');
    expect(tt).not.toContain('source:');
    expect(tt).not.toContain('chain:');
    expect(tt).not.toContain('selector:');
    handle.destroy();
  });

  it('setPicked(null) removes the chip', () => {
    const handle = createComposer({
      container,
      onSubmit: vi.fn(),
      picked: makePicked(),
    });
    expect(getChipHost(handle.element).children.length).toBe(1);
    handle.setPicked(null);
    expect(getChipHost(handle.element).children.length).toBe(0);
    handle.destroy();
  });

  it('textarea is pinned with flex 0 0 auto so the stream area scrolls instead of squeezing the input', () => {
    const handle = createComposer({ container, onSubmit: vi.fn() });
    const ta = getTextarea(handle.element);
    expect(ta.style.flex).toBe('0 0 auto');
    handle.destroy();
  });

  it('chip host collapses its padding in the empty state and restores it once a chip is added', () => {
    const handle = createComposer({ container, onSubmit: vi.fn() });
    const chipHost = getChipHost(handle.element);
    expect(chipHost.style.padding).toBe('0px');
    handle.setPicked(makePicked());
    expect(chipHost.style.padding).toBe('10px 12px 0px');
    handle.setPicked(null);
    expect(chipHost.style.padding).toBe('0px');
    handle.destroy();
  });

  it('setSending disables textarea + send', () => {
    const handle = createComposer({ container, onSubmit: vi.fn() });
    const ta = getTextarea(handle.element);
    ta.value = 'hi';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    expect(getSendButton(handle.element).disabled).toBe(false);
    handle.setSending(true);
    expect(ta.disabled).toBe(true);
    expect(getSendButton(handle.element).disabled).toBe(true);
    handle.setSending(false);
    expect(ta.disabled).toBe(false);
    expect(getSendButton(handle.element).disabled).toBe(false);
  });

  it('does not submit while sending', () => {
    const onSubmit = vi.fn();
    const handle = createComposer({ container, onSubmit });
    const ta = getTextarea(handle.element);
    ta.value = 'hi';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    handle.setSending(true);
    ta.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    expect(onSubmit).not.toHaveBeenCalled();
    handle.destroy();
  });

  it('destroy removes the panel and is idempotent', () => {
    const handle = createComposer({ container, onSubmit: vi.fn() });
    handle.destroy();
    expect(container.children.length).toBe(0);
    expect(() => handle.destroy()).not.toThrow();
  });

  it('setText updates the textarea + enables send for non-empty', () => {
    const handle = createComposer({ container, onSubmit: vi.fn() });
    handle.setText('hello');
    expect(getTextarea(handle.element).value).toBe('hello');
    expect(getSendButton(handle.element).disabled).toBe(false);
    handle.setText('');
    expect(getSendButton(handle.element).disabled).toBe(true);
    handle.destroy();
  });

  it('Send button click submits', () => {
    const onSubmit = vi.fn();
    const handle = createComposer({ container, onSubmit });
    const ta = getTextarea(handle.element);
    ta.value = 'go';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    getSendButton(handle.element).click();
    expect(onSubmit).toHaveBeenCalledWith({ text: 'go', picked: null });
    handle.destroy();
  });

  it('setAnchor aligns the panel above the launcher (right + bottom)', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    const handle = createComposer({ container, onSubmit: vi.fn() });
    handle.setAnchor({ x: 40, y: 60 });
    // right = launcher.x. bottom = launcher.y + 48 (size) + 16 (gap) = 124.
    expect(handle.element.style.right).toBe('40px');
    expect(handle.element.style.bottom).toBe('124px');
    expect(handle.element.style.left).toBe('auto');
    expect(handle.element.style.top).toBe('auto');
    handle.destroy();
  });

  it('setAnchor honors a custom launcherSize and gap', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    const handle = createComposer({ container, onSubmit: vi.fn() });
    handle.setAnchor({ x: 10, y: 10, launcherSize: 64, gap: 8 });
    // bottom = 10 + 64 + 8 = 82
    expect(handle.element.style.bottom).toBe('82px');
    expect(handle.element.style.right).toBe('10px');
    handle.destroy();
  });

  it('setAnchor clamps the panel when the launcher is near the top of the viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 });
    const handle = createComposer({ container, onSubmit: vi.fn() });
    // Default fallback panel height is 420. With innerHeight 500 and a
    // launcher at y=400 (close to the top), the unclamped bottom would be
    // 400+48+16=464, putting the panel top at 464+420=884 → way past the
    // viewport top. setAnchor should slide it down so bottom = 500 - 420 = 80.
    handle.setAnchor({ x: 20, y: 400 });
    expect(handle.element.style.bottom).toBe('80px');
    expect(handle.element.style.right).toBe('20px');
    handle.destroy();
  });

  it('setAnchor floors negative x to 0', () => {
    const handle = createComposer({ container, onSubmit: vi.fn() });
    handle.setAnchor({ x: -50, y: 10 });
    expect(handle.element.style.right).toBe('0px');
    handle.destroy();
  });

  it('settings gear button calls onToggleSettings', () => {
    const onToggleSettings = vi.fn();
    const handle = createComposer({ container, onSubmit: vi.fn(), onToggleSettings });
    const gear = handle.element.querySelector<HTMLButtonElement>(
      '[data-agent-devtools-composer-settings]',
    );
    expect(gear).not.toBeNull();
    gear?.click();
    expect(onToggleSettings).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it('setSettingsActive toggles the gear icon active state', () => {
    const handle = createComposer({ container, onSubmit: vi.fn() });
    const gear = handle.element.querySelector<HTMLButtonElement>(
      '[data-agent-devtools-composer-settings]',
    );
    if (!gear) throw new Error('gear not found');
    // The active state is painted with a var() token (dropped by the headless
    // CSS engine) and mirrored onto aria-pressed, which is the stable signal.
    expect(gear.getAttribute('aria-pressed')).toBe('false');
    handle.setSettingsActive(true);
    expect(gear.getAttribute('aria-pressed')).toBe('true');
    handle.setSettingsActive(false);
    expect(gear.getAttribute('aria-pressed')).toBe('false');
    handle.destroy();
  });

  it('does not submit while IME composing (event.isComposing)', () => {
    const onSubmit = vi.fn();
    const handle = createComposer({ container, onSubmit });
    const ta = getTextarea(handle.element);
    ta.value = '한글';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'isComposing', { value: true });
    ta.dispatchEvent(ev);
    expect(onSubmit).not.toHaveBeenCalled();
    handle.destroy();
  });

  it('handoff button calls onHandoff', () => {
    const onHandoff = vi.fn();
    const handle = createComposer({ container, onSubmit: vi.fn(), onHandoff });
    const btn = handle.element.querySelector<HTMLButtonElement>(
      '[data-agent-devtools-composer-handoff]',
    );
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('aria-label')).toMatch(/terminal/i);
    btn?.click();
    expect(onHandoff).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  // --- Drag-resize ---------------------------------------------------------
  //
  // The composer is anchored to the bottom-right corner (follows the
  // launcher). Resize handles sit on the LEFT edge, TOP edge, and NW corner
  // so dragging them outward (away from the anchor) grows the panel inward.
  // happy-dom doesn't synthesise full PointerEvents, but it forwards the
  // event init properties we need (pointerId, clientX/Y) when we construct
  // an Event ourselves and dispatch it on the target.

  function pointerEvent(
    type: 'pointerdown' | 'pointermove' | 'pointerup',
    init: { pointerId: number; clientX: number; clientY: number },
  ): Event {
    // happy-dom + jsdom both support `new PointerEvent` when the constructor
    // exists; happy-dom < 22 falls back to MouseEvent for some clients. We
    // try PointerEvent first and degrade to Event + assigned properties.
    const Ctor = (globalThis as unknown as { PointerEvent?: typeof PointerEvent }).PointerEvent;
    if (Ctor) {
      return new Ctor(type, {
        bubbles: true,
        cancelable: true,
        ...init,
      });
    }
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'pointerId', { value: init.pointerId });
    Object.defineProperty(ev, 'clientX', { value: init.clientX });
    Object.defineProperty(ev, 'clientY', { value: init.clientY });
    return ev;
  }

  type ResizeAxis =
    | 'left'
    | 'right'
    | 'top'
    | 'bottom'
    | 'corner-nw'
    | 'corner-ne'
    | 'corner-sw'
    | 'corner-se';

  function getHandle(panel: HTMLElement, axis: ResizeAxis): HTMLElement {
    return panel.querySelector(`[data-agent-devtools-composer-resize="${axis}"]`) as HTMLElement;
  }

  it('mounts eight resize handles (4 edges + 4 corners)', () => {
    const handle = createComposer({ container, onSubmit: vi.fn(), sizeStorage: null });
    for (const axis of [
      'left',
      'right',
      'top',
      'bottom',
      'corner-nw',
      'corner-ne',
      'corner-sw',
      'corner-se',
    ] as const) {
      expect(getHandle(handle.element, axis)).not.toBeNull();
    }
    handle.destroy();
  });

  it('applies the default size when no persisted value is present', () => {
    const handle = createComposer({ container, onSubmit: vi.fn(), sizeStorage: null });
    expect(handle.element.style.width).toBe('360px');
    expect(handle.element.style.height).toBe('420px');
    handle.destroy();
  });

  it('left-handle drag grows width inward (anchor is on the right)', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1200 });
    const handle = createComposer({ container, onSubmit: vi.fn(), sizeStorage: null });
    const left = getHandle(handle.element, 'left');
    left.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 500, clientY: 300 }));
    // Drag 80px leftward → width should grow by 80 (startWidth + (startX - clientX))
    left.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 420, clientY: 300 }));
    expect(handle.element.style.width).toBe('440px');
    expect(handle.element.style.height).toBe('420px'); // unchanged on left-only drag
    left.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 420, clientY: 300 }));
    handle.destroy();
  });

  it('top-handle drag grows height inward', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1200 });
    const handle = createComposer({ container, onSubmit: vi.fn(), sizeStorage: null });
    const top = getHandle(handle.element, 'top');
    top.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, clientX: 800, clientY: 600 }));
    // Drag 100px upward → height should grow by 100 (startY - clientY)
    top.dispatchEvent(pointerEvent('pointermove', { pointerId: 2, clientX: 800, clientY: 500 }));
    expect(handle.element.style.height).toBe('520px');
    expect(handle.element.style.width).toBe('360px');
    top.dispatchEvent(pointerEvent('pointerup', { pointerId: 2, clientX: 800, clientY: 500 }));
    handle.destroy();
  });

  it('corner-handle drag grows both width and height', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1200 });
    const handle = createComposer({ container, onSubmit: vi.fn(), sizeStorage: null });
    const corner = getHandle(handle.element, 'corner-nw');
    corner.dispatchEvent(pointerEvent('pointerdown', { pointerId: 3, clientX: 800, clientY: 600 }));
    corner.dispatchEvent(pointerEvent('pointermove', { pointerId: 3, clientX: 750, clientY: 550 }));
    expect(handle.element.style.width).toBe('410px');
    expect(handle.element.style.height).toBe('470px');
    corner.dispatchEvent(pointerEvent('pointerup', { pointerId: 3, clientX: 750, clientY: 550 }));
    handle.destroy();
  });

  it('clamps width to the minimum (320px) when dragged inward beyond the floor', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1200 });
    const handle = createComposer({ container, onSubmit: vi.fn(), sizeStorage: null });
    const left = getHandle(handle.element, 'left');
    left.dispatchEvent(pointerEvent('pointerdown', { pointerId: 4, clientX: 500, clientY: 300 }));
    // Drag rightward (clientX > startX) shrinks; pull way past zero width.
    left.dispatchEvent(pointerEvent('pointermove', { pointerId: 4, clientX: 1000, clientY: 300 }));
    expect(handle.element.style.width).toBe('320px');
    left.dispatchEvent(pointerEvent('pointerup', { pointerId: 4, clientX: 1000, clientY: 300 }));
    handle.destroy();
  });

  it('clamps width to 80vw when dragged outward past the viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1200 });
    const handle = createComposer({ container, onSubmit: vi.fn(), sizeStorage: null });
    const left = getHandle(handle.element, 'left');
    left.dispatchEvent(pointerEvent('pointerdown', { pointerId: 5, clientX: 800, clientY: 300 }));
    // Drag far enough that startWidth + delta would exceed 80vw (= 800px).
    left.dispatchEvent(pointerEvent('pointermove', { pointerId: 5, clientX: 0, clientY: 300 }));
    expect(handle.element.style.width).toBe('800px');
    left.dispatchEvent(pointerEvent('pointerup', { pointerId: 5, clientX: 0, clientY: 300 }));
    handle.destroy();
  });

  it('persists the final size to the provided storage on pointerup', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1200 });
    const store = new Map<string, string>();
    const sizeStorage: Storage = {
      get length(): number {
        return store.size;
      },
      clear(): void {
        store.clear();
      },
      getItem(key: string): string | null {
        return store.get(key) ?? null;
      },
      key(index: number): string | null {
        return Array.from(store.keys())[index] ?? null;
      },
      removeItem(key: string): void {
        store.delete(key);
      },
      setItem(key: string, value: string): void {
        store.set(key, value);
      },
    };
    const handle = createComposer({ container, onSubmit: vi.fn(), sizeStorage });
    const corner = getHandle(handle.element, 'corner-nw');
    corner.dispatchEvent(pointerEvent('pointerdown', { pointerId: 6, clientX: 800, clientY: 600 }));
    corner.dispatchEvent(pointerEvent('pointermove', { pointerId: 6, clientX: 700, clientY: 500 }));
    corner.dispatchEvent(pointerEvent('pointerup', { pointerId: 6, clientX: 700, clientY: 500 }));
    const persisted = store.get('agent-devtools:panelSize');
    expect(persisted).toBeTruthy();
    const parsed = JSON.parse(persisted!) as { width: number; height: number };
    // happy-dom doesn't lay out so offsetWidth/Height are 0; the impl falls
    // back to parseFloat(style.width/height) which we just set during the
    // drag. After a 100px corner drag, both axes grew by 100.
    expect(parsed.width).toBe(460);
    expect(parsed.height).toBe(520);
    handle.destroy();
  });

  it('loads the persisted size on construct', () => {
    const store = new Map<string, string>([
      ['agent-devtools:panelSize', JSON.stringify({ width: 480, height: 600 })],
    ]);
    const sizeStorage: Storage = {
      get length(): number {
        return store.size;
      },
      clear(): void {
        store.clear();
      },
      getItem(key: string): string | null {
        return store.get(key) ?? null;
      },
      key(index: number): string | null {
        return Array.from(store.keys())[index] ?? null;
      },
      removeItem(key: string): void {
        store.delete(key);
      },
      setItem(key: string, value: string): void {
        store.set(key, value);
      },
    };
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1200 });
    const handle = createComposer({ container, onSubmit: vi.fn(), sizeStorage });
    expect(handle.element.style.width).toBe('480px');
    expect(handle.element.style.height).toBe('600px');
    handle.destroy();
  });

  it('skips persistence when sizeStorage is null', () => {
    const handle = createComposer({ container, onSubmit: vi.fn(), sizeStorage: null });
    // Just exercise the path — no exception, default size applies.
    const left = getHandle(handle.element, 'left');
    left.dispatchEvent(pointerEvent('pointerdown', { pointerId: 7, clientX: 500, clientY: 300 }));
    left.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, clientX: 480, clientY: 300 }));
    left.dispatchEvent(pointerEvent('pointerup', { pointerId: 7, clientX: 480, clientY: 300 }));
    expect(handle.element.style.width).toBe('380px');
    handle.destroy();
  });

  // The lit colour is now a CSS var() theme token (resolved by the browser),
  // and non-browser CSS engines drop var() from inline styles — so "is the
  // affordance showing" is tracked by a dedicated state attribute rather than
  // the painted background value.
  const LIT_ATTR = 'data-agent-devtools-composer-resize-lit';

  it('pointerenter on a resize handle paints a hover affordance; leave resets it', () => {
    const handle = createComposer({ container, onSubmit: vi.fn(), sizeStorage: null });
    const left = getHandle(handle.element, 'left');
    expect(left.hasAttribute(LIT_ATTR)).toBe(false);
    left.dispatchEvent(
      pointerEvent('pointerenter' as 'pointerdown', { pointerId: 20, clientX: 0, clientY: 0 }),
    );
    expect(left.hasAttribute(LIT_ATTR)).toBe(true);
    left.dispatchEvent(
      pointerEvent('pointerleave' as 'pointerdown', { pointerId: 20, clientX: 0, clientY: 0 }),
    );
    expect(left.hasAttribute(LIT_ATTR)).toBe(false);
    handle.destroy();
  });

  it('keeps the hover affordance lit during an active drag even if the cursor leaves the handle', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1200 });
    const handle = createComposer({ container, onSubmit: vi.fn(), sizeStorage: null });
    const left = getHandle(handle.element, 'left');
    left.dispatchEvent(pointerEvent('pointerdown', { pointerId: 21, clientX: 500, clientY: 300 }));
    expect(left.hasAttribute(LIT_ATTR)).toBe(true);
    // Simulate the cursor leaving the 6px strip while pointer capture keeps
    // the drag alive — the handle must stay lit so the user can still see
    // what they're dragging.
    left.dispatchEvent(
      pointerEvent('pointerleave' as 'pointerdown', { pointerId: 21, clientX: 300, clientY: 300 }),
    );
    expect(left.hasAttribute(LIT_ATTR)).toBe(true);
    left.dispatchEvent(pointerEvent('pointerup', { pointerId: 21, clientX: 300, clientY: 300 }));
    expect(left.hasAttribute(LIT_ATTR)).toBe(false);
    handle.destroy();
  });

  it('drag events from a different pointerId are ignored', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1200 });
    const handle = createComposer({ container, onSubmit: vi.fn(), sizeStorage: null });
    const left = getHandle(handle.element, 'left');
    left.dispatchEvent(pointerEvent('pointerdown', { pointerId: 8, clientX: 500, clientY: 300 }));
    // Different pointerId — should not move the panel.
    left.dispatchEvent(pointerEvent('pointermove', { pointerId: 99, clientX: 400, clientY: 300 }));
    expect(handle.element.style.width).toBe('360px');
    left.dispatchEvent(pointerEvent('pointerup', { pointerId: 8, clientX: 500, clientY: 300 }));
    handle.destroy();
  });

  // --- Outward-edge resize handles ----------------------------------------
  //
  // `right` and `bottom` edges (and the SE/SW/NE corners they participate in)
  // grow the panel by sliding their own edge with the cursor — the launcher
  // anchor on the opposite side stays put, and the dragged edge's CSS
  // (`right` / `bottom`) decreases by the drag delta. We seed a known
  // anchor via setAnchor so `startRight`/`startBottom` are non-zero and
  // the delta math is testable without clamping to 0.

  it('right-handle drag grows width outward (right edge follows cursor)', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1200 });
    const handle = createComposer({ container, onSubmit: vi.fn(), sizeStorage: null });
    handle.setAnchor({ x: 100, y: 100 });
    const right = getHandle(handle.element, 'right');
    right.dispatchEvent(pointerEvent('pointerdown', { pointerId: 10, clientX: 800, clientY: 300 }));
    // Drag 50px rightward → width grows by 50, panel.style.right shrinks by 50.
    right.dispatchEvent(pointerEvent('pointermove', { pointerId: 10, clientX: 850, clientY: 300 }));
    expect(handle.element.style.width).toBe('410px');
    expect(handle.element.style.height).toBe('420px'); // unchanged on horizontal-only drag
    expect(handle.element.style.right).toBe('50px'); // 100 - 50
    right.dispatchEvent(pointerEvent('pointerup', { pointerId: 10, clientX: 850, clientY: 300 }));
    handle.destroy();
  });

  it('bottom-handle drag grows height outward (bottom edge follows cursor)', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1200 });
    const handle = createComposer({ container, onSubmit: vi.fn(), sizeStorage: null });
    handle.setAnchor({ x: 24, y: 24 }); // bottom = 24 + 48 + 16 = 88
    const bottom = getHandle(handle.element, 'bottom');
    bottom.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 11, clientX: 800, clientY: 300 }),
    );
    // Drag 50px downward → height grows by 50, panel.style.bottom shrinks by 50.
    bottom.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 11, clientX: 800, clientY: 350 }),
    );
    expect(handle.element.style.height).toBe('470px');
    expect(handle.element.style.width).toBe('360px');
    expect(handle.element.style.bottom).toBe('38px'); // 88 - 50
    bottom.dispatchEvent(pointerEvent('pointerup', { pointerId: 11, clientX: 800, clientY: 350 }));
    handle.destroy();
  });

  it('corner-ne drag grows width outward and height inward', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1200 });
    const handle = createComposer({ container, onSubmit: vi.fn(), sizeStorage: null });
    handle.setAnchor({ x: 100, y: 100 });
    const corner = getHandle(handle.element, 'corner-ne');
    corner.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 12, clientX: 800, clientY: 600 }),
    );
    // Drag up-and-right: right edge follows cursor (right -50), top edge grows up (height +50).
    corner.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 12, clientX: 850, clientY: 550 }),
    );
    expect(handle.element.style.width).toBe('410px');
    expect(handle.element.style.height).toBe('470px');
    expect(handle.element.style.right).toBe('50px');
    corner.dispatchEvent(pointerEvent('pointerup', { pointerId: 12, clientX: 850, clientY: 550 }));
    handle.destroy();
  });

  it('corner-sw drag grows width inward and height outward', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1200 });
    const handle = createComposer({ container, onSubmit: vi.fn(), sizeStorage: null });
    handle.setAnchor({ x: 24, y: 24 });
    const corner = getHandle(handle.element, 'corner-sw');
    corner.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 13, clientX: 800, clientY: 300 }),
    );
    // Drag down-and-left: left edge slides outward (width +50), bottom edge follows cursor (bottom -50).
    corner.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 13, clientX: 750, clientY: 350 }),
    );
    expect(handle.element.style.width).toBe('410px');
    expect(handle.element.style.height).toBe('470px');
    expect(handle.element.style.bottom).toBe('38px');
    corner.dispatchEvent(pointerEvent('pointerup', { pointerId: 13, clientX: 750, clientY: 350 }));
    handle.destroy();
  });

  it('corner-se drag grows both width and height outward', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1200 });
    const handle = createComposer({ container, onSubmit: vi.fn(), sizeStorage: null });
    handle.setAnchor({ x: 100, y: 100 });
    const corner = getHandle(handle.element, 'corner-se');
    corner.dispatchEvent(
      pointerEvent('pointerdown', { pointerId: 14, clientX: 800, clientY: 300 }),
    );
    // Drag down-and-right: both edges follow the cursor; right -50, bottom -50.
    corner.dispatchEvent(
      pointerEvent('pointermove', { pointerId: 14, clientX: 850, clientY: 350 }),
    );
    expect(handle.element.style.width).toBe('410px');
    expect(handle.element.style.height).toBe('470px');
    expect(handle.element.style.right).toBe('50px');
    expect(handle.element.style.bottom).toBe('114px'); // 164 - 50
    corner.dispatchEvent(pointerEvent('pointerup', { pointerId: 14, clientX: 850, clientY: 350 }));
    handle.destroy();
  });

  // --- New-session button -------------------------------------------------

  it('mounts a new-session button with a descriptive aria-label', () => {
    const handle = createComposer({ container, onSubmit: vi.fn() });
    const btn = handle.element.querySelector<HTMLButtonElement>(
      '[data-agent-devtools-composer-new-session]',
    );
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('aria-label')).toMatch(/new conversation/i);
    handle.destroy();
  });

  it('new-session button click calls onNewSession', () => {
    const onNewSession = vi.fn();
    const handle = createComposer({ container, onSubmit: vi.fn(), onNewSession });
    const btn = handle.element.querySelector<HTMLButtonElement>(
      '[data-agent-devtools-composer-new-session]',
    );
    btn?.click();
    expect(onNewSession).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it('new-session button click is a no-op when onNewSession is not provided', () => {
    const handle = createComposer({ container, onSubmit: vi.fn() });
    const btn = handle.element.querySelector<HTMLButtonElement>(
      '[data-agent-devtools-composer-new-session]',
    );
    expect(() => btn?.click()).not.toThrow();
    handle.destroy();
  });

  // --- Safe mode toggle ---------------------------------------------------

  it('renders a safe-mode toggle in the header with role="switch" and aria-label', () => {
    const handle = createComposer({ container, onSubmit: vi.fn() });
    const btn = handle.element.querySelector<HTMLButtonElement>(
      '[data-agent-devtools-composer-safe-mode]',
    );
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('role')).toBe('switch');
    expect(btn?.getAttribute('aria-label')).toBe('Safe mode');
    // Defaults to on — aria-checked=true and the data attribute mirrors it.
    expect(btn?.getAttribute('aria-checked')).toBe('true');
    expect(btn?.getAttribute('data-safe-mode')).toBe('on');
    handle.destroy();
  });

  it('starts the safe-mode toggle in the off state when safeMode: false is supplied', () => {
    const handle = createComposer({ container, onSubmit: vi.fn(), safeMode: false });
    const btn = handle.element.querySelector<HTMLButtonElement>(
      '[data-agent-devtools-composer-safe-mode]',
    );
    expect(btn?.getAttribute('aria-checked')).toBe('false');
    expect(btn?.getAttribute('data-safe-mode')).toBe('off');
    handle.destroy();
  });

  it('clicking the safe-mode toggle flips state and emits onToggleSafeMode with the new value', () => {
    const onToggleSafeMode = vi.fn();
    const handle = createComposer({ container, onSubmit: vi.fn(), onToggleSafeMode });
    const btn = handle.element.querySelector<HTMLButtonElement>(
      '[data-agent-devtools-composer-safe-mode]',
    )!;
    btn.click();
    expect(onToggleSafeMode).toHaveBeenLastCalledWith(false);
    expect(btn.getAttribute('aria-checked')).toBe('false');
    btn.click();
    expect(onToggleSafeMode).toHaveBeenLastCalledWith(true);
    expect(btn.getAttribute('aria-checked')).toBe('true');
    handle.destroy();
  });

  it('setSafeMode repaints without invoking onToggleSafeMode', () => {
    const onToggleSafeMode = vi.fn();
    const handle = createComposer({ container, onSubmit: vi.fn(), onToggleSafeMode });
    const btn = handle.element.querySelector<HTMLButtonElement>(
      '[data-agent-devtools-composer-safe-mode]',
    )!;
    handle.setSafeMode(false);
    expect(btn.getAttribute('aria-checked')).toBe('false');
    expect(btn.getAttribute('data-safe-mode')).toBe('off');
    expect(onToggleSafeMode).not.toHaveBeenCalled();
    handle.setSafeMode(true);
    expect(btn.getAttribute('aria-checked')).toBe('true');
    expect(onToggleSafeMode).not.toHaveBeenCalled();
    handle.destroy();
  });

  it('clicking the safe-mode toggle without onToggleSafeMode does not throw', () => {
    const handle = createComposer({ container, onSubmit: vi.fn() });
    const btn = handle.element.querySelector<HTMLButtonElement>(
      '[data-agent-devtools-composer-safe-mode]',
    );
    expect(() => btn?.click()).not.toThrow();
    handle.destroy();
  });

  // ── L2 surfacing: error banner + analyze affordance ───────────────────
  //
  // The orchestrator subscribes to the runtime-error observer and pushes
  // the live count down via `setErrorCount`. The composer renders a slim
  // banner when count > 0 and an Analyze button when an `onAnalyzeErrors`
  // callback is wired. Clicking Analyze hands the count back to the
  // orchestrator (which prefills the textarea + resets the count).

  it('keeps the error banner hidden when no errors have been surfaced', () => {
    const handle = createComposer({ container, onSubmit: vi.fn() });
    const banner = handle.element.querySelector(
      '[data-agent-devtools-composer-error-banner]',
    ) as HTMLDivElement;
    expect(banner).not.toBeNull();
    expect(banner.style.display).toBe('none');
    expect(handle.getErrorCount()).toBe(0);
    handle.destroy();
  });

  it('shows the banner with a pluralised count once setErrorCount is called', () => {
    const handle = createComposer({
      container,
      onSubmit: vi.fn(),
      onAnalyzeErrors: vi.fn(),
    });
    const banner = handle.element.querySelector(
      '[data-agent-devtools-composer-error-banner]',
    ) as HTMLDivElement;
    const text = handle.element.querySelector(
      '[data-agent-devtools-composer-error-banner-text]',
    ) as HTMLSpanElement;

    handle.setErrorCount(1);
    expect(banner.style.display).toBe('flex');
    expect(text.textContent).toBe('1 runtime error captured');

    handle.setErrorCount(4);
    expect(text.textContent).toBe('4 runtime errors captured');
    handle.destroy();
  });

  it('collapses counts above 99 to "99+" in the banner text', () => {
    const handle = createComposer({ container, onSubmit: vi.fn(), onAnalyzeErrors: vi.fn() });
    const text = handle.element.querySelector(
      '[data-agent-devtools-composer-error-banner-text]',
    ) as HTMLSpanElement;
    handle.setErrorCount(250);
    expect(text.textContent).toBe('99+ runtime errors captured');
    expect(handle.getErrorCount()).toBe(250);
    handle.destroy();
  });

  it('normalises negative / non-finite counts to 0 and hides the banner', () => {
    const handle = createComposer({ container, onSubmit: vi.fn() });
    handle.setErrorCount(3);
    handle.setErrorCount(-1);
    const banner = handle.element.querySelector(
      '[data-agent-devtools-composer-error-banner]',
    ) as HTMLDivElement;
    expect(banner.style.display).toBe('none');
    expect(handle.getErrorCount()).toBe(0);
    handle.setErrorCount(Number.NaN);
    expect(handle.getErrorCount()).toBe(0);
    handle.destroy();
  });

  it('hides the Analyze action when no onAnalyzeErrors callback is wired', () => {
    const handle = createComposer({ container, onSubmit: vi.fn() });
    handle.setErrorCount(2);
    const action = handle.element.querySelector(
      '[data-agent-devtools-composer-error-banner-action]',
    ) as HTMLButtonElement;
    expect(action.style.display).toBe('none');
    handle.destroy();
  });

  it('fires onAnalyzeErrors with the count at click-time', () => {
    const onAnalyzeErrors = vi.fn();
    const handle = createComposer({ container, onSubmit: vi.fn(), onAnalyzeErrors });
    handle.setErrorCount(7);
    const action = handle.element.querySelector(
      '[data-agent-devtools-composer-error-banner-action]',
    ) as HTMLButtonElement;
    expect(action.style.display).toBe('inline-flex');
    action.click();
    expect(onAnalyzeErrors).toHaveBeenCalledWith(7);
    handle.destroy();
  });

  it('ignores setErrorCount calls after destroy', () => {
    const handle = createComposer({ container, onSubmit: vi.fn() });
    handle.destroy();
    expect(() => handle.setErrorCount(3)).not.toThrow();
    expect(handle.getErrorCount()).toBe(0);
  });
});
