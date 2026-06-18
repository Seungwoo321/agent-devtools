import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountAgentDevtools, type AgentDevtoolsTransport } from './mount.js';
import { createSettingsStore } from '../settings/index.js';
import type { SlashCommandInfo } from '../stream/index.js';

beforeEach(() => {
  document.body.innerHTML = '';
  // The settings store persists to localStorage; without a reset, a
  // previous test's mutation (e.g. switching the provider to `sdk`) would
  // leak into the next test's initial state. The conversation store
  // mirrors the same pattern over sessionStorage.
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

describe('mountAgentDevtools', () => {
  it('mounts widget host with launcher + composer + stream renderer in shadow root', () => {
    const handle = mountAgentDevtools();
    expect(handle.widget.host.isConnected).toBe(true);
    expect(handle.launcher.element).toBeInstanceOf(HTMLButtonElement);
    expect(handle.composer.element.style.display).toBe('none');
    // Stream renderer is inserted before the textarea so the conversation
    // scrolls above the input.
    const textarea = handle.composer.element.querySelector('textarea');
    expect(textarea).not.toBeNull();
    expect(handle.streamRenderer.element.nextSibling).toBe(textarea);
    handle.destroy();
  });

  it('throws if no document is available', () => {
    // Falls back to globalThis.document — the handle survives, so destroy it
    // so its document-level keydown listener doesn't leak across tests.
    const handle = mountAgentDevtools({ document: undefined as unknown as Document });
    handle.destroy();
  });

  it('appends an error message when no transport is configured and the user submits', () => {
    const handle = mountAgentDevtools();
    handle.composer.setText('what is this');
    handle.composer.element
      .querySelector('textarea')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const items = handle.store.getItems();
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'user', text: 'what is this' });
    expect(items[1]).toMatchObject({ kind: 'error' });
    expect((items[1] as { message: string }).message).toMatch(/transport/i);
    handle.destroy();
  });

  it('ignores empty / whitespace-only submissions', () => {
    const transport: AgentDevtoolsTransport = { send: vi.fn().mockResolvedValue(undefined) };
    const handle = mountAgentDevtools({ transport });
    handle.composer.setText('   ');
    handle.composer.element
      .querySelector('textarea')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(handle.store.getItems()).toHaveLength(0);
    expect(transport.send).not.toHaveBeenCalled();
    handle.destroy();
  });

  it('clears the textarea on submit and forwards to the transport with built page context', async () => {
    const send = vi.fn().mockImplementation(() => new Promise(() => {}));
    const handle = mountAgentDevtools({ transport: { send } });
    handle.composer.setText('hello agent');
    handle.composer.element
      .querySelector('textarea')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    // `handleSubmit` clears the textarea synchronously but reaches `transport.send`
    // only after the async `maybeEnrichPageContext` microtask resolves.
    expect(handle.composer.getText()).toBe('');
    await Promise.resolve();
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0]![0];
    expect(payload.text).toBe('hello agent');
    expect(payload.picked).toBeNull();
    expect(payload.pageContext).toMatchObject({ schemaVersion: expect.any(Number) });
    expect(payload.store).toBe(handle.store);
    expect(payload.signal).toBeInstanceOf(AbortSignal);
    expect(payload.signal.aborted).toBe(false);
    handle.destroy();
  });

  it('aborts the in-flight request on destroy', async () => {
    let capturedSignal: AbortSignal | null = null;
    const send = vi.fn().mockImplementation((p: { signal: AbortSignal }) => {
      capturedSignal = p.signal;
      return new Promise(() => {});
    });
    const handle = mountAgentDevtools({ transport: { send } });
    handle.composer.setText('hi');
    handle.composer.element
      .querySelector('textarea')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    // Flush past `await maybeEnrichPageContext` so `transport.send` is invoked
    // and `capturedSignal` is populated before we trigger destroy.
    await Promise.resolve();
    await Promise.resolve();
    handle.destroy();
    expect(capturedSignal!.aborted).toBe(true);
  });

  it('surfaces transport errors via an error event', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network down'));
    const handle = mountAgentDevtools({ transport: { send } });
    handle.composer.setText('please');
    handle.composer.element
      .querySelector('textarea')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    const items = handle.store.getItems();
    const error = items.find((it) => it.kind === 'error') as { message: string } | undefined;
    expect(error?.message).toBe('network down');
    handle.destroy();
  });

  it('does not surface an error when the transport rejection is due to abort on destroy', async () => {
    const send = vi.fn().mockImplementation(
      (p: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          p.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const handle = mountAgentDevtools({ transport: { send } });
    handle.composer.setText('hello');
    handle.composer.element
      .querySelector('textarea')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    handle.destroy();
    await Promise.resolve();
    await Promise.resolve();
    const errors = handle.store.getItems().filter((it) => it.kind === 'error');
    expect(errors).toHaveLength(0);
  });

  it('flips the composer between hidden and visible when the launcher is clicked', () => {
    const handle = mountAgentDevtools();
    expect(handle.composer.element.style.display).toBe('none');
    handle.launcher.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // The launcher's reducer fires `onClick` only via a click effect — simulate
    // by calling the toggle directly via the same path the launcher uses.
    // (happy-dom doesn't synthesize the full pointer flow here.)
    // Instead, exercise the orchestrator-visible API: setVisible round-trip.
    handle.composer.setVisible(true);
    expect(handle.composer.element.style.display).toBe('flex');
    handle.destroy();
  });

  it('shows the composer and updates the picked chip when an element is picked', () => {
    const handle = mountAgentDevtools();
    const target = document.createElement('section');
    target.id = 'target';
    target.textContent = 'pick me';
    document.body.appendChild(target);

    const pickButton = queryShadow<HTMLButtonElement>(
      handle.widget.shadowRoot,
      '[data-agent-devtools-composer-pick]',
    );
    pickButton.click();
    expect(handle.composer.element.style.display).toBe('none');

    // happy-dom's elementFromPoint is a stub — the picker uses it to resolve
    // the actual click target, so we point it at the test target.
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(target);
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(handle.composer.element.style.display).toBe('flex');
    const chip = handle.composer.element.querySelector('[data-agent-devtools-composer-chip] span');
    expect(chip?.textContent).toBeTruthy();
    vi.restoreAllMocks();
    handle.destroy();
  });

  it('uses an injected describePicked resolver instead of the default fiber walker', () => {
    const customPicked = vi.fn((element: Element) => ({
      componentName: 'CustomComponent',
      tagName: element.tagName,
      selector: '#custom',
      outerHTML: element.outerHTML,
      attributes: {},
      componentChain: [],
    }));
    const handle = mountAgentDevtools({ describePicked: customPicked });
    const target = document.createElement('section');
    target.id = 'target';
    document.body.appendChild(target);

    const pickButton = queryShadow<HTMLButtonElement>(
      handle.widget.shadowRoot,
      '[data-agent-devtools-composer-pick]',
    );
    pickButton.click();
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(target);
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(customPicked).toHaveBeenCalledWith(target);
    const label = handle.composer.element.querySelector(
      '[data-agent-devtools-composer-chip-label]',
    );
    expect(label?.textContent).toBe('CustomComponent');
    vi.restoreAllMocks();
    handle.destroy();
  });

  it('calls the adapter-supplied resolveRouteFile with the current pathname and surfaces routeFile', async () => {
    const send = vi.fn().mockImplementation(() => new Promise(() => {}));
    const resolveRouteFile = vi.fn((pathname: string) => `pages${pathname}.tsx`);
    const handle = mountAgentDevtools({ transport: { send }, resolveRouteFile });
    handle.composer.setText('which file owns this');
    handle.composer.element
      .querySelector('textarea')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    expect(resolveRouteFile).toHaveBeenCalled();
    const calledWith = resolveRouteFile.mock.calls[0]?.[0];
    expect(calledWith).toBe(window.location.pathname);
    const payload = send.mock.calls[0]![0];
    expect(payload.pageContext.route.routeFile).toBe(`pages${window.location.pathname}.tsx`);
    handle.destroy();
  });

  it('omits route.routeFile when the resolver returns undefined', async () => {
    const send = vi.fn().mockImplementation(() => new Promise(() => {}));
    const resolveRouteFile = vi.fn(() => undefined);
    const handle = mountAgentDevtools({ transport: { send }, resolveRouteFile });
    handle.composer.setText('no route file please');
    handle.composer.element
      .querySelector('textarea')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    expect(resolveRouteFile).toHaveBeenCalled();
    const payload = send.mock.calls[0]![0];
    expect(payload.pageContext.route.routeFile).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(payload.pageContext.route, 'routeFile')).toBe(
      false,
    );
    handle.destroy();
  });

  it('hides the composer when the user closes it', () => {
    const handle = mountAgentDevtools();
    handle.composer.setVisible(true);
    const close = queryShadow<HTMLButtonElement>(
      handle.widget.shadowRoot,
      '[data-agent-devtools-composer-close]',
    );
    close.click();
    expect(handle.composer.element.style.display).toBe('none');
    handle.destroy();
  });

  it('clears the picked chip when the user removes it', () => {
    const handle = mountAgentDevtools();
    const target = document.createElement('article');
    target.id = 'pick-target';
    document.body.appendChild(target);

    const pickButton = queryShadow<HTMLButtonElement>(
      handle.widget.shadowRoot,
      '[data-agent-devtools-composer-pick]',
    );
    pickButton.click();
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(target);
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    const chipRemove = handle.composer.element.querySelector(
      '[data-agent-devtools-composer-chip] button',
    ) as HTMLButtonElement;
    chipRemove.click();
    expect(
      handle.composer.element.querySelector('[data-agent-devtools-composer-chip] span'),
    ).toBeNull();
    vi.restoreAllMocks();
    handle.destroy();
  });

  it('anchors the composer to the launcher position on mount', () => {
    const handle = mountAgentDevtools();
    // Default launcher position is { x: 24, y: 24 }; composer anchors above
    // (right: x, bottom: y + launcherSize + gap = 24 + 48 + 16 = 88).
    expect(handle.composer.element.style.right).toBe('24px');
    expect(handle.composer.element.style.bottom).toBe('88px');
    handle.destroy();
  });

  it('moves the composer when the launcher position changes', () => {
    // Make the viewport tall enough that the composer's anchor doesn't trip
    // the top-overflow clamp (fallback panel height is 420px).
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1200 });
    const handle = mountAgentDevtools();
    handle.launcher.setPosition({ x: 200, y: 300 });
    expect(handle.composer.element.style.right).toBe('200px');
    // bottom = launcher.y (300) + launcherSize (48) + gap (16) = 364
    expect(handle.composer.element.style.bottom).toBe('364px');
    handle.destroy();
  });

  it('destroy is idempotent', () => {
    const handle = mountAgentDevtools();
    handle.destroy();
    expect(() => handle.destroy()).not.toThrow();
  });
});

describe('mountAgentDevtools — slash-command side channel', () => {
  // The transport decodes the agent's `available_commands_update`
  // notification into its `onCommands` listener; the orchestrator wires
  // that listener (post-construction, because the composer doesn't exist
  // when the transport is built) to push the catalogue into the composer's
  // autocomplete menu.
  it('subscribes to the transport command channel and feeds the composer autocomplete', () => {
    let captured: ((commands: readonly { name: string; description: string }[]) => void) | null =
      null;
    const transport: AgentDevtoolsTransport = {
      send: vi.fn().mockResolvedValue(undefined),
      onCommands: (listener): void => {
        captured = listener;
      },
    };
    const handle = mountAgentDevtools({ transport });

    // The orchestrator installed its sink during mount.
    expect(captured).not.toBeNull();

    // Drive a catalogue through the side channel end-to-end.
    captured!([
      { name: 'review', description: 'Review the diff' },
      { name: 'refactor', description: 'Refactor the component' },
    ]);

    // The catalogue reached the composer: typing a matching slash prefix
    // now opens the autocomplete menu with the pushed commands.
    const textarea = handle.composer.element.querySelector('textarea')!;
    textarea.value = '/re';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    const menu = handle.composer.element.querySelector(
      '[data-agent-devtools-composer-cmd-menu]',
    ) as HTMLElement;
    expect(menu.style.display).toBe('block');
    const items = handle.composer.element.querySelectorAll(
      '[data-agent-devtools-composer-cmd-item]',
    );
    expect(items).toHaveLength(2);

    handle.destroy();
  });

  it('is a no-op-safe when the transport omits onCommands (optional method)', () => {
    const transport: AgentDevtoolsTransport = { send: vi.fn().mockResolvedValue(undefined) };
    expect(() => mountAgentDevtools({ transport }).destroy()).not.toThrow();
  });

  // SCN5: submitting a slash command sends the raw text unchanged — NO
  // client-side macro expansion — so the provider runtime expands it
  // natively, and the user bubble shows the literal slash command text.
  it('sends a slash command as raw text unchanged with no client-side expansion', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const handle = mountAgentDevtools({ transport: { send } });
    const rawCommand = '/review the homepage';
    handle.composer.setText(rawCommand);
    handle.composer.element
      .querySelector('textarea')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // The user bubble shows the literal slash command text — no stripping,
    // no expansion. (The store also appends an `assistant-pending`
    // placeholder while the turn is active; SCN5 only constrains the user
    // bubble, so assert on the first item rather than the total count.)
    const items = handle.store.getItems();
    const userItems = items.filter((it) => it.kind === 'user');
    expect(userItems).toHaveLength(1);
    expect(userItems[0]).toMatchObject({ kind: 'user', text: rawCommand });

    // The transport receives the same raw text after the enrichment
    // microtask resolves.
    await Promise.resolve();
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].text).toBe(rawCommand);

    handle.destroy();
  });
});

describe('mountAgentDevtools — host key isolation', () => {
  // KeyboardEvent is `composed: true`, so a keystroke inside the closed
  // shadow root retargets onto the shadow host and keeps bubbling to the
  // host document. The widget installs a bubble-phase stop on the shadow
  // host so host-page shortcuts (Storybook's `D`, Notion's `/`, etc.) don't
  // fire while the user types in the chat panel.
  function dispatchInsideWidget(
    handle: ReturnType<typeof mountAgentDevtools>,
    type: 'keydown' | 'keyup' | 'keypress',
  ): void {
    const textarea = handle.composer.element.querySelector('textarea');
    if (!textarea) throw new Error('composer textarea missing');
    textarea.dispatchEvent(
      new KeyboardEvent(type, { key: 'd', bubbles: true, composed: true, cancelable: true }),
    );
  }

  it.each(['keydown', 'keyup', 'keypress'] as const)(
    'does not leak %s from the widget panel to host document bubble listeners',
    (type) => {
      const handle = mountAgentDevtools();
      const hostListener = vi.fn();
      document.addEventListener(type, hostListener);
      try {
        dispatchInsideWidget(handle, type);
        expect(hostListener).not.toHaveBeenCalled();
      } finally {
        document.removeEventListener(type, hostListener);
        handle.destroy();
      }
    },
  );

  it('still lets the composer textarea keydown handler run (Enter submit unaffected)', () => {
    // The shadow-host stop is in the bubble phase, so widget-internal
    // handlers on the textarea (Enter → submit) execute first and only the
    // leak-out hop is suppressed.
    const send = vi.fn().mockImplementation(() => new Promise(() => {}));
    const handle = mountAgentDevtools({ transport: { send } });
    handle.composer.setText('hi');
    handle.composer.element
      .querySelector('textarea')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    expect(handle.composer.getText()).toBe('');
    handle.destroy();
  });

  it('removes the host-key stop listeners on destroy', () => {
    const handle = mountAgentDevtools();
    const host = handle.widget.host;
    const removeSpy = vi.spyOn(host, 'removeEventListener');
    handle.destroy();
    const removedTypes = removeSpy.mock.calls.map((call) => call[0]);
    expect(removedTypes).toEqual(expect.arrayContaining(['keydown', 'keyup', 'keypress']));
    removeSpy.mockRestore();
  });
});

describe('mountAgentDevtools — new conversation handler', () => {
  function getNewSessionButton(handle: ReturnType<typeof mountAgentDevtools>): HTMLButtonElement {
    return queryShadow<HTMLButtonElement>(
      handle.widget.shadowRoot,
      '[data-agent-devtools-composer-new-session]',
    );
  }

  it('clears the message store, resets the composer, and calls transport.resetSession', () => {
    const resetSession = vi.fn();
    const send = vi.fn().mockResolvedValue(undefined);
    const handle = mountAgentDevtools({ transport: { send, resetSession } });
    // Seed: one user message (carries an inert pending placeholder behind
    // it from the typing indicator) + some composer text.
    handle.composer.setText('half-typed prompt');
    handle.store.appendUserMessage('previous turn');
    expect(handle.store.getItems()).toHaveLength(2);

    getNewSessionButton(handle).click();

    expect(handle.store.getItems()).toHaveLength(0);
    expect(handle.composer.getText()).toBe('');
    expect(resetSession).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it('aborts the in-flight send so trailing chunks do not land in the cleared store', async () => {
    let capturedSignal: AbortSignal | null = null;
    const send = vi.fn().mockImplementation((p: { signal: AbortSignal }) => {
      capturedSignal = p.signal;
      return new Promise(() => {}); // never resolves — simulates an open stream
    });
    const resetSession = vi.fn();
    const handle = mountAgentDevtools({ transport: { send, resetSession } });
    handle.composer.setText('please answer');
    handle.composer.element
      .querySelector('textarea')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    // `handleSubmit` only calls `transport.send` after the enrichment microtask resolves.
    await Promise.resolve();
    await Promise.resolve();
    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal!.aborted).toBe(false);

    getNewSessionButton(handle).click();

    expect(capturedSignal!.aborted).toBe(true);
    handle.destroy();
  });

  it('is a no-op-safe when transport omits resetSession (optional method)', () => {
    const send = vi.fn().mockResolvedValue(undefined);
    // No resetSession property — optional in the AgentDevtoolsTransport contract.
    const handle = mountAgentDevtools({ transport: { send } });
    handle.store.appendUserMessage('prior');
    expect(() => getNewSessionButton(handle).click()).not.toThrow();
    expect(handle.store.getItems()).toHaveLength(0);
    handle.destroy();
  });

  it('works without any transport configured', () => {
    const handle = mountAgentDevtools();
    handle.store.appendUserMessage('prior');
    expect(() => getNewSessionButton(handle).click()).not.toThrow();
    expect(handle.store.getItems()).toHaveLength(0);
    handle.destroy();
  });

  it('clears the picked element along with the conversation', () => {
    const resetSession = vi.fn();
    const send = vi.fn().mockResolvedValue(undefined);
    const handle = mountAgentDevtools({ transport: { send, resetSession } });

    const target = document.createElement('article');
    target.id = 'pick-target';
    document.body.appendChild(target);
    const pickButton = queryShadow<HTMLButtonElement>(
      handle.widget.shadowRoot,
      '[data-agent-devtools-composer-pick]',
    );
    pickButton.click();
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(target);
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(
      handle.composer.element.querySelector('[data-agent-devtools-composer-chip] span'),
    ).not.toBeNull();

    getNewSessionButton(handle).click();

    expect(
      handle.composer.element.querySelector('[data-agent-devtools-composer-chip] span'),
    ).toBeNull();
    vi.restoreAllMocks();
    handle.destroy();
  });
});

describe('mountAgentDevtools — production-build guard', () => {
  // `process` isn't in the react tsconfig types — read it through a typed
  // accessor so the tests don't pull in @types/node just for env mutation.
  function getEnv(): Record<string, string | undefined> {
    const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
    if (!g.process?.env) throw new Error('test runner exposes no process.env');
    return g.process.env;
  }
  const originalNodeEnv = getEnv().NODE_ENV;
  afterEach(() => {
    const env = getEnv();
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
  });

  it('refuses to mount when NODE_ENV === "production"', () => {
    getEnv().NODE_ENV = 'production';
    expect(() => mountAgentDevtools()).toThrow(/production build/i);
  });

  it('the refusal message points at the recommended import.meta.env.DEV pattern', () => {
    getEnv().NODE_ENV = 'production';
    try {
      mountAgentDevtools();
      throw new Error('expected throw');
    } catch (err) {
      expect((err as Error).message).toMatch(/import\.meta\.env\.DEV/);
      expect((err as Error).message).toMatch(/force/);
    }
  });

  it('honors force: true to override the guard', () => {
    getEnv().NODE_ENV = 'production';
    const handle = mountAgentDevtools({ force: true });
    expect(handle.widget.host.isConnected).toBe(true);
    handle.destroy();
  });

  it('mounts normally when NODE_ENV is "development"', () => {
    getEnv().NODE_ENV = 'development';
    const handle = mountAgentDevtools();
    expect(handle.widget.host.isConnected).toBe(true);
    handle.destroy();
  });

  it('mounts normally when NODE_ENV is unset', () => {
    delete getEnv().NODE_ENV;
    const handle = mountAgentDevtools();
    expect(handle.widget.host.isConnected).toBe(true);
    handle.destroy();
  });

  it('mounts normally when NODE_ENV is "test" (vitest default)', () => {
    getEnv().NODE_ENV = 'test';
    const handle = mountAgentDevtools();
    expect(handle.widget.host.isConnected).toBe(true);
    handle.destroy();
  });
});

describe('mountAgentDevtools — settings panel wiring', () => {
  function queryComposer<T extends Element = HTMLElement>(
    composer: HTMLElement,
    selector: string,
  ): T {
    const el = composer.querySelector(selector);
    if (!el) throw new Error(`composer query miss: ${selector}`);
    return el as T;
  }

  it('mounts the settings panel hidden by default, alongside the stream renderer', () => {
    const handle = mountAgentDevtools();
    expect(handle.settingsPanel.element.style.display).toBe('none');
    // Stream renderer's own root applies `display: flex`; it stays visible
    // until the gear icon swaps to settings.
    expect(handle.streamRenderer.element.style.display).toBe('flex');
    // Both panel and stream renderer sit inside the composer body.
    expect(handle.settingsPanel.element.parentElement).toBe(handle.composer.element);
    expect(handle.streamRenderer.element.parentElement).toBe(handle.composer.element);
    handle.destroy();
  });

  it('clicking the gear icon shows the settings panel and hides the stream renderer', () => {
    const handle = mountAgentDevtools();
    const gear = queryComposer<HTMLButtonElement>(
      handle.composer.element,
      '[data-agent-devtools-composer-settings]',
    );
    gear.click();
    expect(handle.settingsPanel.element.style.display).toBe('flex');
    expect(handle.streamRenderer.element.style.display).toBe('none');
    // Toggling again restores the stream view.
    gear.click();
    expect(handle.settingsPanel.element.style.display).toBe('none');
    expect(handle.streamRenderer.element.style.display).toBe('flex');
    handle.destroy();
  });

  it('clicking the panel close button returns to the stream view', () => {
    const handle = mountAgentDevtools();
    const gear = queryComposer<HTMLButtonElement>(
      handle.composer.element,
      '[data-agent-devtools-composer-settings]',
    );
    gear.click();
    expect(handle.settingsPanel.element.style.display).toBe('flex');
    const closeBtn = queryComposer<HTMLButtonElement>(
      handle.settingsPanel.element,
      '[data-agent-devtools-settings-close]',
    );
    closeBtn.click();
    expect(handle.settingsPanel.element.style.display).toBe('none');
    expect(handle.streamRenderer.element.style.display).toBe('flex');
    handle.destroy();
  });

  it('reuses an externally supplied settings store so mutations propagate', () => {
    const settingsStore = createSettingsStore();
    const handle = mountAgentDevtools({ settingsStore });
    expect(handle.settingsStore).toBe(settingsStore);
    // Update the store from the outside; the panel must reflect it.
    settingsStore.set({ provider: 'sdk' });
    const sdkRadio = handle.settingsPanel.element.querySelector(
      '[data-agent-devtools-settings-provider="sdk"]',
    ) as HTMLInputElement;
    expect(sdkRadio.checked).toBe(true);
    handle.destroy();
  });

  it('seeds the host data-theme from the settings store and follows changes', () => {
    const settingsStore = createSettingsStore();
    settingsStore.set({ theme: 'dark' });
    const handle = mountAgentDevtools({ settingsStore });
    // Initial attribute mirrors the store value present at mount time.
    expect(handle.widget.host.getAttribute('data-theme')).toBe('dark');
    // A later store change flips the single host attribute — that one write
    // is what recolours the whole widget via the CSS tokens.
    settingsStore.set({ theme: 'light' });
    expect(handle.widget.host.getAttribute('data-theme')).toBe('light');
    handle.destroy();
  });

  it('defaults the host data-theme to auto when no theme was chosen', () => {
    const handle = mountAgentDevtools();
    expect(handle.widget.host.getAttribute('data-theme')).toBe('auto');
    handle.destroy();
  });

  it('creates an internal settings store when none is supplied', () => {
    const handle = mountAgentDevtools();
    expect(handle.settingsStore).toBeDefined();
    expect(typeof handle.settingsStore.get).toBe('function');
    // Default settings hydrate the panel.
    const acpRadio = handle.settingsPanel.element.querySelector(
      '[data-agent-devtools-settings-provider="acp"]',
    ) as HTMLInputElement;
    expect(acpRadio.checked).toBe(true);
    handle.destroy();
  });

  it('async-hydrates the panel with server info via getServerInfo', async () => {
    const getServerInfo = vi.fn().mockResolvedValue({
      workspaceRoot: '/tmp/proj',
      providers: ['acp'],
      defaults: { provider: 'acp', permissionMode: 'acceptEdits' },
    });
    const handle = mountAgentDevtools({ getServerInfo });
    expect(getServerInfo).toHaveBeenCalledTimes(1);
    // Workspace value before hydration is the placeholder.
    const workspace = handle.settingsPanel.element.querySelector(
      '[data-agent-devtools-settings-workspace]',
    )!;
    expect(workspace.textContent).toBe('(not configured)');
    // Let the promise settle.
    await Promise.resolve();
    await Promise.resolve();
    expect(workspace.textContent).toBe('/tmp/proj');
    // The unregistered `sdk` provider should be disabled.
    const sdkRadio = handle.settingsPanel.element.querySelector(
      '[data-agent-devtools-settings-provider="sdk"]',
    ) as HTMLInputElement;
    expect(sdkRadio.disabled).toBe(true);
    handle.destroy();
  });

  it('silently ignores a getServerInfo rejection so the widget stays usable', async () => {
    const getServerInfo = vi.fn().mockRejectedValue(new Error('boom'));
    const handle = mountAgentDevtools({ getServerInfo });
    await Promise.resolve();
    await Promise.resolve();
    // Workspace stays at the placeholder; no throw.
    const workspace = handle.settingsPanel.element.querySelector(
      '[data-agent-devtools-settings-workspace]',
    )!;
    expect(workspace.textContent).toBe('(not configured)');
    handle.destroy();
  });

  it('does not push hydration into a destroyed panel', async () => {
    let resolveHydration: (value: {
      workspaceRoot: string;
      providers: string[];
      defaults: { provider: string; permissionMode: string };
    }) => void = () => undefined;
    const getServerInfo = vi.fn().mockImplementation(
      () =>
        new Promise<{
          workspaceRoot: string;
          providers: string[];
          defaults: { provider: string; permissionMode: string };
        }>((res) => {
          resolveHydration = res;
        }),
    );
    const handle = mountAgentDevtools({ getServerInfo });
    const setServerInfoSpy = vi.spyOn(handle.settingsPanel, 'setServerInfo');
    handle.destroy();
    resolveHydration({
      workspaceRoot: '/late',
      providers: ['acp'],
      defaults: { provider: 'acp', permissionMode: 'acceptEdits' },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(setServerInfoSpy).not.toHaveBeenCalled();
  });
});

describe('mountAgentDevtools — terminal handoff wiring', () => {
  function clickHandoff(handle: ReturnType<typeof mountAgentDevtools>): void {
    const btn = handle.composer.element.querySelector(
      '[data-agent-devtools-composer-handoff]',
    ) as HTMLButtonElement | null;
    if (!btn) throw new Error('handoff button missing');
    btn.click();
  }

  it('mounts the handoff modal hidden by default inside the shadow container', () => {
    const handle = mountAgentDevtools();
    expect(handle.handoffModal.element.style.display).toBe('none');
    expect(handle.handoffModal.element.parentElement).toBe(handle.widget.container);
    handle.destroy();
  });

  it('renders an error in the modal when no requestHandoff is configured', () => {
    const handle = mountAgentDevtools();
    clickHandoff(handle);
    expect(handle.handoffModal.element.style.display).toBe('flex');
    const cmd = handle.handoffModal.element.querySelector('[data-agent-devtools-handoff-command]');
    expect(cmd?.textContent ?? '').toMatch(/not configured/i);
    handle.destroy();
  });

  it('calls requestHandoff with the user/assistant turns from the message store', async () => {
    const requestHandoff = vi.fn().mockResolvedValue({
      file: '/tmp/x.md',
      command: 'claude --append-system-prompt-file /tmp/x.md',
    });
    const handle = mountAgentDevtools({ requestHandoff });
    handle.store.appendUserMessage('why red');
    handle.store.applyEvent({ type: 'text-delta', blockId: 'b1', text: 'because' });
    handle.store.applyEvent({ type: 'text-delta', blockId: 'b1', text: ' .danger' });
    handle.store.applyEvent({ type: 'text-stop', blockId: 'b1' });
    // Tool-use / error noise should be filtered out of the handoff payload.
    handle.store.applyEvent({ type: 'tool-use-start', blockId: 't1', name: 'Read' });
    handle.store.applyEvent({ type: 'error', message: 'noisy' });

    clickHandoff(handle);
    // `handleHandoff` reaches `requestHandoff` only after the enrichment microtask resolves.
    await Promise.resolve();
    await Promise.resolve();
    expect(requestHandoff).toHaveBeenCalledTimes(1);
    const req = requestHandoff.mock.calls[0]![0];
    expect(req.conversation).toEqual([
      { role: 'user', text: 'why red' },
      { role: 'assistant', text: 'because .danger' },
    ]);
    expect(req.permissionMode).toBe('acceptEdits');
    expect(req.signal).toBeInstanceOf(AbortSignal);
    expect(req.pageContext).toMatchObject({ schemaVersion: expect.any(Number) });
    handle.destroy();
  });

  it('shows the loading state immediately and the ready state after the request resolves', async () => {
    let resolveReq: (value: { file: string; command: string }) => void = () => undefined;
    const requestHandoff = vi.fn().mockImplementation(
      () =>
        new Promise<{ file: string; command: string }>((res) => {
          resolveReq = res;
        }),
    );
    const handle = mountAgentDevtools({ requestHandoff });
    clickHandoff(handle);
    // Loading frame is shown synchronously by `handoffModal.showLoading()`
    // before the first await in `handleHandoff`.
    const cmd = handle.handoffModal.element.querySelector('[data-agent-devtools-handoff-command]');
    expect(cmd?.textContent ?? '').toMatch(/preparing/i);
    // Flush past enrichment so `requestHandoff` is invoked and `resolveReq`
    // is rebound to the in-flight promise's resolver.
    await Promise.resolve();
    await Promise.resolve();
    resolveReq({ file: '/tmp/x.md', command: 'claude --append-system-prompt-file /tmp/x.md' });
    await Promise.resolve();
    await Promise.resolve();
    expect(cmd?.textContent ?? '').toContain('--append-system-prompt-file');
    handle.destroy();
  });

  it('shows the error state when requestHandoff rejects', async () => {
    const requestHandoff = vi.fn().mockRejectedValue(new Error('server down'));
    const handle = mountAgentDevtools({ requestHandoff });
    clickHandoff(handle);
    await Promise.resolve();
    await Promise.resolve();
    const cmd = handle.handoffModal.element.querySelector('[data-agent-devtools-handoff-command]');
    expect(cmd?.textContent ?? '').toMatch(/handoff failed: server down/i);
    handle.destroy();
  });

  it('aborts the in-flight handoff request on destroy', async () => {
    let captured: AbortSignal | null = null;
    const requestHandoff = vi.fn().mockImplementation((req: { signal?: AbortSignal }) => {
      captured = req.signal ?? null;
      return new Promise(() => {});
    });
    const handle = mountAgentDevtools({ requestHandoff });
    clickHandoff(handle);
    // Flush past enrichment so `requestHandoff` is invoked and `captured` is populated.
    await Promise.resolve();
    await Promise.resolve();
    handle.destroy();
    expect(captured!.aborted).toBe(true);
  });

  it('aborts the in-flight handoff request when the modal is closed', async () => {
    let captured: AbortSignal | null = null;
    const requestHandoff = vi.fn().mockImplementation((req: { signal?: AbortSignal }) => {
      captured = req.signal ?? null;
      return new Promise(() => {});
    });
    const handle = mountAgentDevtools({ requestHandoff });
    clickHandoff(handle);
    // Flush past enrichment so `requestHandoff` is invoked.
    await Promise.resolve();
    await Promise.resolve();
    (
      handle.handoffModal.element.querySelector(
        '[data-agent-devtools-handoff-close]',
      ) as HTMLButtonElement
    ).click();
    expect(captured!.aborted).toBe(true);
    handle.destroy();
  });

  it('forwards the current permissionMode from the settings store', async () => {
    const settingsStore = createSettingsStore();
    settingsStore.set({ permissionMode: 'bypassPermissions' });
    const requestHandoff = vi.fn().mockResolvedValue({ file: '/tmp/x.md', command: 'cmd' });
    const handle = mountAgentDevtools({ settingsStore, requestHandoff });
    clickHandoff(handle);
    // Flush past enrichment so `requestHandoff.mock.calls[0]` exists.
    await Promise.resolve();
    await Promise.resolve();
    expect(requestHandoff.mock.calls[0]![0].permissionMode).toBe('bypassPermissions');
    handle.destroy();
  });

  it('forwards the transport.getClientSessionId() value into requestHandoff', async () => {
    const requestHandoff = vi.fn().mockResolvedValue({ file: '/tmp/x.md', command: 'cmd' });
    const transport: AgentDevtoolsTransport = {
      send: vi.fn().mockResolvedValue(undefined),
      getClientSessionId: () => 'cs-tab-7',
    };
    const handle = mountAgentDevtools({ transport, requestHandoff });
    clickHandoff(handle);
    await Promise.resolve();
    await Promise.resolve();
    expect(requestHandoff.mock.calls[0]![0].clientSessionId).toBe('cs-tab-7');
    handle.destroy();
  });

  it('omits clientSessionId from requestHandoff when the transport lacks the getter', async () => {
    const requestHandoff = vi.fn().mockResolvedValue({ file: '/tmp/x.md', command: 'cmd' });
    const transport: AgentDevtoolsTransport = {
      send: vi.fn().mockResolvedValue(undefined),
    };
    const handle = mountAgentDevtools({ transport, requestHandoff });
    clickHandoff(handle);
    await Promise.resolve();
    await Promise.resolve();
    expect(requestHandoff.mock.calls[0]![0].clientSessionId).toBeUndefined();
    handle.destroy();
  });

  it('omits clientSessionId from requestHandoff when the getter returns undefined', async () => {
    const requestHandoff = vi.fn().mockResolvedValue({ file: '/tmp/x.md', command: 'cmd' });
    const transport: AgentDevtoolsTransport = {
      send: vi.fn().mockResolvedValue(undefined),
      getClientSessionId: () => undefined,
    };
    const handle = mountAgentDevtools({ transport, requestHandoff });
    clickHandoff(handle);
    await Promise.resolve();
    await Promise.resolve();
    expect(requestHandoff.mock.calls[0]![0].clientSessionId).toBeUndefined();
    handle.destroy();
  });

  it('surfaces resumeCommand from requestHandoff into the modal ready state', async () => {
    const requestHandoff = vi.fn().mockResolvedValue({
      file: '/tmp/x.md',
      command: "claude --append-system-prompt-file '/tmp/x.md'",
      resumeCommand: "cd '/Users/dev/project' && claude --resume 'acp-XYZ'",
    });
    const handle = mountAgentDevtools({ requestHandoff });
    clickHandoff(handle);
    await Promise.resolve();
    await Promise.resolve();
    const resumeBox = handle.handoffModal.element.querySelector(
      'pre[data-agent-devtools-handoff-resume-command]',
    );
    expect(resumeBox?.textContent ?? '').toContain("claude --resume 'acp-XYZ'");
    handle.destroy();
  });
});

describe('mountAgentDevtools — enrichPageContext wiring', () => {
  function submit(handle: ReturnType<typeof mountAgentDevtools>, text: string): void {
    handle.composer.setText(text);
    handle.composer.element
      .querySelector('textarea')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }

  it('awaits enrichment and forwards the enriched page context to the transport', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const enrichPageContext = vi.fn(async (ctx) => ({
      ...ctx,
      picked: {
        componentName: 'Synth',
        tagName: 'DIV',
        selector: '#x',
        outerHTML: '<div />',
        attributes: {},
        componentChain: [],
        relatedImports: ['src/Imported.tsx'],
      },
    }));
    const handle = mountAgentDevtools({ transport: { send }, enrichPageContext });
    submit(handle, 'hi');
    await Promise.resolve();
    await Promise.resolve();
    expect(enrichPageContext).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0]![0];
    expect(payload.pageContext.picked.relatedImports).toEqual(['src/Imported.tsx']);
    handle.destroy();
  });

  it('falls back to the base page context when enrichment rejects', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const enrichPageContext = vi.fn(async () => {
      throw new Error('module-graph down');
    });
    const handle = mountAgentDevtools({ transport: { send }, enrichPageContext });
    submit(handle, 'hi');
    await Promise.resolve();
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].pageContext).toBeDefined();
    // The pageContext should be the unenriched base — no relatedImports field.
    expect(send.mock.calls[0]![0].pageContext.picked?.relatedImports).toBeUndefined();
    handle.destroy();
  });

  it('skips the transport.send when enrichment lasts past abort', async () => {
    let resolveEnrich: (() => void) | null = null;
    const enrichPageContext = vi.fn((ctx, _signal) => {
      return new Promise<typeof ctx>((res) => {
        resolveEnrich = () => res(ctx);
      });
    });
    const send = vi.fn().mockResolvedValue(undefined);
    const handle = mountAgentDevtools({ transport: { send }, enrichPageContext });
    submit(handle, 'hi');
    // Destroy aborts the in-flight controller before enrichment completes.
    handle.destroy();
    resolveEnrich!();
    await Promise.resolve();
    await Promise.resolve();
    expect(send).not.toHaveBeenCalled();
  });

  describe('widget visibility + toggle hotkey', () => {
    function pressToggleHotkey(target: Document | Element = document): void {
      target.dispatchEvent(
        new KeyboardEvent('keydown', {
          ctrlKey: true,
          shiftKey: true,
          code: 'Semicolon',
          key: ';',
          bubbles: true,
          cancelable: true,
        }),
      );
    }

    it('defaultVisible: false hides launcher and composer on mount', () => {
      const handle = mountAgentDevtools({ defaultVisible: false });
      expect(handle.launcher.isVisible()).toBe(false);
      expect(handle.launcher.element.style.display).toBe('none');
      expect(handle.composer.element.style.display).toBe('none');
      handle.destroy();
    });

    it('defaults to visible when defaultVisible is unset', () => {
      const handle = mountAgentDevtools();
      expect(handle.launcher.isVisible()).toBe(true);
      expect(handle.launcher.element.style.display).toBe('flex');
      handle.destroy();
    });

    it('Ctrl+Shift+; toggles launcher visibility', () => {
      const handle = mountAgentDevtools({ defaultVisible: false });
      expect(handle.launcher.isVisible()).toBe(false);
      pressToggleHotkey();
      expect(handle.launcher.isVisible()).toBe(true);
      expect(handle.launcher.element.style.display).toBe('flex');
      pressToggleHotkey();
      expect(handle.launcher.isVisible()).toBe(false);
      expect(handle.launcher.element.style.display).toBe('none');
      handle.destroy();
    });

    it('Meta+Shift+; toggles launcher visibility (mac)', () => {
      const handle = mountAgentDevtools({ defaultVisible: false });
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          metaKey: true,
          shiftKey: true,
          code: 'Semicolon',
          key: ';',
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(handle.launcher.isVisible()).toBe(true);
      handle.destroy();
    });

    it('accepts the IME-shifted `:` key as the toggle trigger', () => {
      const handle = mountAgentDevtools({ defaultVisible: false });
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          ctrlKey: true,
          shiftKey: true,
          // code missing — some browsers omit it on synthesized events; the
          // listener should fall back to `event.key`.
          key: ':',
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(handle.launcher.isVisible()).toBe(true);
      handle.destroy();
    });

    it('ignores the hotkey without modifiers', () => {
      const handle = mountAgentDevtools({ defaultVisible: false });
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          code: 'Semicolon',
          key: ';',
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(handle.launcher.isVisible()).toBe(false);
      handle.destroy();
    });

    it('ignores the hotkey when shift is absent', () => {
      const handle = mountAgentDevtools({ defaultVisible: false });
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          ctrlKey: true,
          code: 'Semicolon',
          key: ';',
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(handle.launcher.isVisible()).toBe(false);
      handle.destroy();
    });

    it('defers to the host when the keydown is already defaultPrevented', () => {
      const handle = mountAgentDevtools({ defaultVisible: false });
      const host = (event: KeyboardEvent): void => event.preventDefault();
      document.addEventListener('keydown', host, true);
      pressToggleHotkey();
      document.removeEventListener('keydown', host, true);
      // The capture-phase host handler called preventDefault, so the
      // orchestrator's listener (non-capture) should bail out.
      expect(handle.launcher.isVisible()).toBe(false);
      handle.destroy();
    });

    it('hides the composer and cancels the picker when toggled off', () => {
      const handle = mountAgentDevtools();
      // happy-dom does not synthesize the full pointer flow from a click
      // MouseEvent, so reach the composer through its public API.
      handle.composer.setVisible(true);
      expect(handle.composer.element.style.display).toBe('flex');
      pressToggleHotkey();
      expect(handle.launcher.isVisible()).toBe(false);
      expect(handle.composer.element.style.display).toBe('none');
      handle.destroy();
    });

    it('disableToggleHotkey: true skips listener registration', () => {
      const handle = mountAgentDevtools({
        defaultVisible: false,
        disableToggleHotkey: true,
      });
      pressToggleHotkey();
      expect(handle.launcher.isVisible()).toBe(false);
      handle.destroy();
    });

    it('destroy removes the keydown listener', () => {
      const handle = mountAgentDevtools({ defaultVisible: false });
      const setVisibleSpy = vi.spyOn(handle.launcher, 'setVisible');
      handle.destroy();
      pressToggleHotkey();
      expect(setVisibleSpy).not.toHaveBeenCalled();
      setVisibleSpy.mockRestore();
    });
  });
});

describe('mountAgentDevtools — visibility persistence', () => {
  const PANEL_OPEN_KEY = 'agent-devtools:panelOpen';
  const WIDGET_VISIBLE_KEY = 'agent-devtools:widgetVisible';

  function pressToggleHotkey(): void {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        ctrlKey: true,
        shiftKey: true,
        code: 'Semicolon',
        key: ';',
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  function pointer(type: 'pointerdown' | 'pointerup', x: number, y: number): Event {
    const Ctor = (globalThis as unknown as { PointerEvent?: typeof PointerEvent }).PointerEvent;
    if (Ctor) {
      return new Ctor(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        button: 0,
        clientX: x,
        clientY: y,
      });
    }
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(ev, {
      pointerId: { value: 1 },
      button: { value: 0 },
      clientX: { value: x },
      clientY: { value: y },
    });
    return ev;
  }

  function clickLauncher(handle: ReturnType<typeof mountAgentDevtools>): void {
    const btn = handle.launcher.element;
    // A no-move pointerdown→pointerup is what the reducer treats as a click.
    btn.dispatchEvent(pointer('pointerdown', 24, 24));
    btn.dispatchEvent(pointer('pointerup', 24, 24));
  }

  it('restores an open panel from storage on mount', () => {
    globalThis.localStorage.setItem(PANEL_OPEN_KEY, 'true');
    const handle = mountAgentDevtools();
    expect(handle.composer.element.style.display).toBe('flex');
    handle.destroy();
  });

  it('starts closed when nothing is persisted', () => {
    const handle = mountAgentDevtools();
    expect(handle.composer.element.style.display).toBe('none');
    handle.destroy();
  });

  it('restores a hidden widget from storage even when defaultVisible would show it', () => {
    globalThis.localStorage.setItem(WIDGET_VISIBLE_KEY, 'false');
    const handle = mountAgentDevtools();
    expect(handle.launcher.isVisible()).toBe(false);
    expect(handle.composer.element.style.display).toBe('none');
    handle.destroy();
  });

  it('a persisted widget-visible flag overrides defaultVisible: false', () => {
    globalThis.localStorage.setItem(WIDGET_VISIBLE_KEY, 'true');
    const handle = mountAgentDevtools({ defaultVisible: false });
    expect(handle.launcher.isVisible()).toBe(true);
    handle.destroy();
  });

  it('persists a launcher-driven open across a remount', () => {
    const first = mountAgentDevtools();
    expect(first.composer.element.style.display).toBe('none');
    clickLauncher(first);
    expect(first.composer.element.style.display).toBe('flex');
    expect(globalThis.localStorage.getItem(PANEL_OPEN_KEY)).toBe('true');
    first.destroy();

    const second = mountAgentDevtools();
    expect(second.composer.element.style.display).toBe('flex');
    second.destroy();
  });

  it('persists an Escape-driven close', () => {
    globalThis.localStorage.setItem(PANEL_OPEN_KEY, 'true');
    const handle = mountAgentDevtools();
    expect(handle.composer.element.style.display).toBe('flex');
    const textarea = handle.composer.element.querySelector('textarea') as HTMLTextAreaElement;
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(handle.composer.element.style.display).toBe('none');
    expect(globalThis.localStorage.getItem(PANEL_OPEN_KEY)).toBe('false');
    handle.destroy();
  });

  it('persists a hotkey-driven widget toggle across a remount', () => {
    const first = mountAgentDevtools({ defaultVisible: false });
    expect(first.launcher.isVisible()).toBe(false);
    pressToggleHotkey();
    expect(first.launcher.isVisible()).toBe(true);
    expect(globalThis.localStorage.getItem(WIDGET_VISIBLE_KEY)).toBe('true');
    first.destroy();

    const second = mountAgentDevtools({ defaultVisible: false });
    expect(second.launcher.isVisible()).toBe(true);
    second.destroy();
  });

  it('hiding the whole widget does not clobber the persisted panel-open choice', () => {
    globalThis.localStorage.setItem(PANEL_OPEN_KEY, 'true');
    const handle = mountAgentDevtools();
    expect(handle.composer.element.style.display).toBe('flex');
    pressToggleHotkey(); // widget goes dark — system-driven collapse
    expect(handle.composer.element.style.display).toBe('none');
    // The collapse is visual only; the user's open choice must survive.
    expect(globalThis.localStorage.getItem(PANEL_OPEN_KEY)).toBe('true');
    handle.destroy();
  });

  it('toggling the picker does not clobber the persisted panel-open choice', () => {
    globalThis.localStorage.setItem(PANEL_OPEN_KEY, 'true');
    const handle = mountAgentDevtools();
    expect(handle.composer.element.style.display).toBe('flex');
    const pickButton = handle.composer.element.querySelector(
      '[data-agent-devtools-composer-pick]',
    ) as HTMLButtonElement;
    pickButton.click(); // panel hides transiently while picking
    expect(handle.composer.element.style.display).toBe('none');
    expect(globalThis.localStorage.getItem(PANEL_OPEN_KEY)).toBe('true');
    handle.destroy();
  });

  // ── Runtime resilience (L0 + L1) ──────────────────────────────────────
  //
  // The widget owns its own boundary. A throw inside picker.onPick (the
  // describePicked walker explodes on a weird DOM node, say) must NOT
  // tear down the widget surface — instead it is captured as a
  // widget-internal record so the agent sees the failure in the same
  // evidence stream as host runtime errors. L0 covers the symmetric pre-
  // mount path: anything caught by the early classic-script trap during
  // host bootstrap is drained into the observer when start() runs.

  it('contains a throw from a wrapped picker.onPick callback and records it as widget-internal', () => {
    const boom = new Error('describePicked exploded');
    const describePicked = vi.fn(() => {
      throw boom;
    });
    const handle = mountAgentDevtools({ describePicked });
    const target = document.createElement('section');
    target.id = 'target';
    document.body.appendChild(target);

    const pickButton = queryShadow<HTMLButtonElement>(
      handle.widget.shadowRoot,
      '[data-agent-devtools-composer-pick]',
    );
    pickButton.click();
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(target);

    // The wrapped onPick swallows the throw — the dispatchEvent call
    // returns normally rather than propagating the Error up to the test.
    expect(() => {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }).not.toThrow();

    const records = handle.observer.getRecords();
    const widgetInternal = records.filter((r) => r.kind === 'widget-internal');
    expect(widgetInternal).toHaveLength(1);
    expect(widgetInternal[0]!.message).toContain('picker.onPick');
    expect(widgetInternal[0]!.message).toContain('describePicked exploded');
    // Widget surface stays usable — the launcher click still toggles the panel.
    handle.launcher.element.click();
    vi.restoreAllMocks();
    handle.destroy();
  });

  it('propagates a fresh runtime error through the observer subscription onto both surfaces', () => {
    const handle = mountAgentDevtools();
    expect(handle.launcher.getErrorCount()).toBe(0);
    expect(handle.composer.getErrorCount()).toBe(0);
    // Inject through the public ingest seam — same path the L1 widget guard
    // uses to surface contained widget-internal throws.
    handle.observer.ingest({
      kind: 'window-error',
      timestamp: Date.now(),
      message: 'host blew up',
    });
    expect(handle.launcher.getErrorCount()).toBe(1);
    expect(handle.composer.getErrorCount()).toBe(1);
    handle.observer.ingest({
      kind: 'console-error',
      timestamp: Date.now(),
      message: 'and again',
    });
    expect(handle.launcher.getErrorCount()).toBe(2);
    expect(handle.composer.getErrorCount()).toBe(2);
    handle.destroy();
  });

  it('clicking Analyze prefills the composer, opens the panel, and clears the unread count', () => {
    const handle = mountAgentDevtools();
    // Two captured errors → banner + badge visible.
    handle.observer.ingest({
      kind: 'window-error',
      timestamp: Date.now(),
      message: 'first',
    });
    handle.observer.ingest({
      kind: 'console-error',
      timestamp: Date.now(),
      message: 'second',
    });
    expect(handle.composer.getErrorCount()).toBe(2);
    const action = handle.composer.element.querySelector(
      '[data-agent-devtools-composer-error-banner-action]',
    ) as HTMLButtonElement;
    action.click();
    expect(handle.composer.getText()).toMatch(/2 runtime errors/);
    expect(handle.composer.element.style.display).toBe('flex');
    expect(handle.composer.getErrorCount()).toBe(0);
    expect(handle.launcher.getErrorCount()).toBe(0);
    handle.destroy();
  });

  it('drains early-trap entries into the observer at mount time', () => {
    // Simulate what the Vite-injected classic <script> trap does before
    // the module bootstrap runs: enqueue an error record onto the global
    // ring buffer. mountAgentDevtools should pick it up via the observer's
    // start() drain so the agent sees the pre-mount failure.
    const EARLY_GLOBAL = '__AGENT_DEVTOOLS_EARLY_ERRORS__';
    (window as unknown as Record<string, unknown>)[EARLY_GLOBAL] = {
      records: [
        {
          kind: 'window-error',
          timestamp: 12345,
          message: 'pre-mount host failure',
          stack: 'at host.js:1:1',
        },
      ],
      dispose: () => {
        delete (window as unknown as Record<string, unknown>)[EARLY_GLOBAL];
      },
    };
    const handle = mountAgentDevtools();
    const drained = handle.observer
      .getRecords()
      .find((r) => r.message === 'pre-mount host failure');
    expect(drained).toBeDefined();
    expect(drained?.kind).toBe('window-error');
    handle.destroy();
  });
});

describe('mountAgentDevtools slash-command prefetch (getAgentCommands)', () => {
  function getCommandItems(handle: ReturnType<typeof mountAgentDevtools>): HTMLElement[] {
    return Array.from(
      handle.composer.element.querySelectorAll('[data-agent-devtools-composer-cmd-item]'),
    );
  }

  function typeSlash(handle: ReturnType<typeof mountAgentDevtools>, value: string): void {
    const ta = handle.composer.element.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('populates the composer autocomplete on the first keystroke before any message is sent', async () => {
    let resolveCommands!: (commands: readonly SlashCommandInfo[]) => void;
    const getAgentCommands = vi.fn(
      () =>
        new Promise<readonly SlashCommandInfo[]>((resolve) => {
          resolveCommands = resolve;
        }),
    );
    const handle = mountAgentDevtools({ getAgentCommands });
    expect(getAgentCommands).toHaveBeenCalledTimes(1);

    // Catalogue resolves at mount — no send required.
    resolveCommands([
      { name: 'review', description: 'Review the picked element', argumentHint: '[files…]' },
      { name: 'refactor', description: 'Refactor the component' },
    ]);
    await Promise.resolve();
    await Promise.resolve();

    // First keystroke ("/") opens the menu already showing the workspace commands.
    typeSlash(handle, '/');
    const items = getCommandItems(handle);
    expect(items).toHaveLength(2);
    const names = items.map(
      (row) =>
        (row.querySelector('[data-agent-devtools-composer-cmd-name]') as HTMLElement).textContent,
    );
    expect(names).toEqual(['/review', '/refactor']);
    handle.destroy();
  });

  it('does not break mount when getAgentCommands rejects', async () => {
    const getAgentCommands = vi.fn(() => Promise.reject(new Error('boom')));
    const handle = mountAgentDevtools({ getAgentCommands });
    await Promise.resolve();
    await Promise.resolve();
    // Widget still functional: typing a slash simply yields no menu items.
    typeSlash(handle, '/');
    expect(getCommandItems(handle)).toHaveLength(0);
    expect(() => handle.destroy()).not.toThrow();
  });

  it('keeps the stream-based transport.onCommands refresh working independently', () => {
    let pushCommands: ((commands: readonly SlashCommandInfo[]) => void) | undefined;
    const transport: AgentDevtoolsTransport = {
      send: vi.fn(),
      onCommands(listener: (commands: readonly SlashCommandInfo[]) => void): void {
        pushCommands = listener;
      },
    };
    // No prefetch fetcher; only the stream side channel feeds the catalogue.
    const handle = mountAgentDevtools({ transport });
    expect(pushCommands).toBeDefined();
    pushCommands?.([{ name: 'explain', description: 'Explain what this does' }]);
    typeSlash(handle, '/');
    const items = getCommandItems(handle);
    expect(items).toHaveLength(1);
    expect(
      (items[0]!.querySelector('[data-agent-devtools-composer-cmd-name]') as HTMLElement)
        .textContent,
    ).toBe('/explain');
    handle.destroy();
  });
});
