import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSettingsPanel } from './panel.js';
import { createSettingsStore } from './store.js';
import type { AgentServerInfo } from './types.js';

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
      return map.has(key) ? (map.get(key) as string) : null;
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

let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.appendChild(container);
});

function providerInput(id: 'acp' | 'sdk'): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(
    `[data-agent-devtools-settings-provider="${id}"]`,
  );
  if (!el) throw new Error(`provider input not found: ${id}`);
  return el;
}

function permissionInput(mode: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(
    `[data-agent-devtools-settings-permission="${mode}"]`,
  );
  if (!el) throw new Error(`permission input not found: ${mode}`);
  return el;
}

describe('createSettingsPanel', () => {
  it('renders provider + permission radios reflecting the current settings', () => {
    const store = createSettingsStore({ storage: makeStorage() });
    store.set({ provider: 'sdk', permissionMode: 'plan' });
    createSettingsPanel({ container, store, visible: true });
    expect(providerInput('sdk').checked).toBe(true);
    expect(providerInput('acp').checked).toBe(false);
    expect(permissionInput('plan').checked).toBe(true);
    expect(permissionInput('acceptEdits').checked).toBe(false);
  });

  it('toggling a provider radio mutates the store', () => {
    const store = createSettingsStore({ storage: makeStorage() });
    createSettingsPanel({ container, store, visible: true });
    const sdkRadio = providerInput('sdk');
    sdkRadio.checked = true;
    sdkRadio.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.get().provider).toBe('sdk');
  });

  it('toggling a permission radio mutates the store', () => {
    const store = createSettingsStore({ storage: makeStorage() });
    createSettingsPanel({ container, store, visible: true });
    const bypassRadio = permissionInput('bypassPermissions');
    bypassRadio.checked = true;
    bypassRadio.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.get().permissionMode).toBe('bypassPermissions');
  });

  it('re-renders when the store changes from outside', () => {
    const store = createSettingsStore({ storage: makeStorage() });
    createSettingsPanel({ container, store, visible: true });
    expect(providerInput('acp').checked).toBe(true);
    store.set({ provider: 'sdk' });
    expect(providerInput('sdk').checked).toBe(true);
    expect(providerInput('acp').checked).toBe(false);
  });

  it('disables provider radios the server has not registered', () => {
    const store = createSettingsStore({ storage: makeStorage() });
    const info: AgentServerInfo = {
      workspaceRoot: '/tmp/proj',
      providers: ['acp'],
      defaultProvider: 'acp',
      defaultPermissionMode: 'acceptEdits',
    };
    createSettingsPanel({ container, store, serverInfo: info, visible: true });
    expect(providerInput('acp').disabled).toBe(false);
    expect(providerInput('sdk').disabled).toBe(true);
  });

  it('setServerInfo() updates the workspace display + provider availability', () => {
    const store = createSettingsStore({ storage: makeStorage() });
    const handle = createSettingsPanel({ container, store, visible: true });
    handle.setServerInfo({
      workspaceRoot: '/work',
      providers: ['sdk'],
      defaultProvider: 'sdk',
      defaultPermissionMode: 'acceptEdits',
    });
    const workspace = container.querySelector<HTMLElement>(
      '[data-agent-devtools-settings-workspace]',
    );
    expect(workspace?.textContent).toBe('/work');
    expect(providerInput('sdk').disabled).toBe(false);
    expect(providerInput('acp').disabled).toBe(true);
  });

  it('shows "(not configured)" when no workspaceRoot is known', () => {
    const store = createSettingsStore({ storage: makeStorage() });
    createSettingsPanel({ container, store, visible: true });
    const workspace = container.querySelector<HTMLElement>(
      '[data-agent-devtools-settings-workspace]',
    );
    expect(workspace?.textContent).toBe('(not configured)');
  });

  it('close button invokes onClose without mutating the store', () => {
    const store = createSettingsStore({ storage: makeStorage() });
    const onClose = vi.fn();
    createSettingsPanel({ container, store, visible: true, onClose });
    const closeBtn = container.querySelector<HTMLButtonElement>(
      '[data-agent-devtools-settings-close]',
    );
    expect(closeBtn).not.toBeNull();
    closeBtn?.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(store.get().provider).toBe('acp');
  });

  it('setVisible() toggles the panel display', () => {
    const store = createSettingsStore({ storage: makeStorage() });
    const handle = createSettingsPanel({ container, store, visible: false });
    expect(handle.element.style.display).toBe('none');
    handle.setVisible(true);
    expect(handle.element.style.display).toBe('flex');
  });

  it('destroy() removes the panel from the container and detaches subscribers', () => {
    const store = createSettingsStore({ storage: makeStorage() });
    const handle = createSettingsPanel({ container, store, visible: true });
    expect(container.contains(handle.element)).toBe(true);
    handle.destroy();
    expect(container.contains(handle.element)).toBe(false);
    // After destroy, store mutations must not throw / re-render anything.
    expect(() => store.set({ provider: 'sdk' })).not.toThrow();
  });

  it('routes its radios to a unique name so two panels in one DOM stay independent', () => {
    const store1 = createSettingsStore({ storage: makeStorage() });
    const store2 = createSettingsStore({ storage: makeStorage() });
    const c1 = document.createElement('div');
    const c2 = document.createElement('div');
    document.body.appendChild(c1);
    document.body.appendChild(c2);
    createSettingsPanel({ container: c1, store: store1, visible: true });
    createSettingsPanel({ container: c2, store: store2, visible: true });

    const name1 = c1.querySelector<HTMLInputElement>('input[type="radio"]')?.name;
    const name2 = c2.querySelector<HTMLInputElement>('input[type="radio"]')?.name;
    expect(name1).toBeTruthy();
    expect(name2).toBeTruthy();
    expect(name1).not.toBe(name2);
  });
});
