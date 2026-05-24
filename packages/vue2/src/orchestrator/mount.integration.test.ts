import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountAgentDevtoolsVue2 } from './mount.js';
import type { Vue2ComponentInstance } from '../vnode/types.js';

beforeEach(() => {
  document.body.innerHTML = '';
  globalThis.localStorage?.clear();
  try {
    globalThis.sessionStorage?.clear();
  } catch {
    /* environments without sessionStorage are fine */
  }
});

afterEach(() => {
  document.body.innerHTML = '';
  globalThis.localStorage?.clear();
  try {
    globalThis.sessionStorage?.clear();
  } catch {
    /* environments without sessionStorage are fine */
  }
});

function queryShadow<T extends Element = HTMLElement>(root: ShadowRoot, selector: string): T {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`shadow query miss: ${selector}`);
  return el as T;
}

describe('mountAgentDevtoolsVue2 picker integration', () => {
  it('resolves Vue 2 component identity through describePickedVue2', () => {
    const handle = mountAgentDevtoolsVue2();
    const target = document.createElement('section');
    target.id = 'counter-card';
    target.textContent = 'count is 0';
    document.body.appendChild(target);
    const instance: Vue2ComponentInstance = {
      _uid: 1,
      $options: { name: 'CounterCard', __file: '/src/CounterCard.vue' },
      $parent: null,
    };
    (target as unknown as { __vue__: Vue2ComponentInstance }).__vue__ = instance;

    const pickButton = queryShadow<HTMLButtonElement>(
      handle.widget.shadowRoot,
      '[data-agent-devtools-composer-pick]',
    );
    pickButton.click();
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(target);
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    const label = handle.composer.element.querySelector(
      '[data-agent-devtools-composer-chip-label]',
    );
    expect(label?.textContent).toBe('CounterCard');
    vi.restoreAllMocks();
    handle.destroy();
  });

  it('falls back to lowercase tagName when the element is not Vue-rendered', () => {
    const handle = mountAgentDevtoolsVue2();
    const target = document.createElement('button');
    target.id = 'plain-button';
    target.textContent = 'Save';
    document.body.appendChild(target);

    const pickButton = queryShadow<HTMLButtonElement>(
      handle.widget.shadowRoot,
      '[data-agent-devtools-composer-pick]',
    );
    pickButton.click();
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(target);
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    const label = handle.composer.element.querySelector(
      '[data-agent-devtools-composer-chip-label]',
    );
    expect(label?.textContent).toBe('button');
    vi.restoreAllMocks();
    handle.destroy();
  });
});
