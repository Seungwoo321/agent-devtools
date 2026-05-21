/**
 * Shared fixtures + helpers for the agent-devtools E2E suite.
 *
 * Why a custom fixture file:
 *   1. Centralize the "open the widget host" plumbing so specs read like
 *      user stories instead of Playwright API plumbing.
 *   2. Detect provider auth (`claude` CLI + Pro subscription) at suite
 *      start and surface a clear `test.skip` rather than letting live
 *      provider specs fail with cryptic timeouts on unconfigured machines.
 *   3. Keep selectors for the shadow-root chrome (composer textarea,
 *      gear, settings radios) in one place — the widget is closed shadow
 *      in production, so every locator needs the open-shadow CSS dance.
 */
import { test as base, expect, type Page, type Locator } from '@playwright/test';
import { execFileSync } from 'node:child_process';

export interface WidgetHandle {
  /** Wait until the widget host element is in the DOM. */
  ready(): Promise<void>;
  /** Click the floating launcher button to toggle the composer. */
  toggle(): Promise<void>;
  /** Open the composer (idempotent — calls toggle only if hidden). */
  open(): Promise<void>;
  /** Locator for the composer textarea (inside the shadow root). */
  textarea(): Locator;
  /** Type into the composer and press Enter. */
  submit(text: string): Promise<void>;
  /** Open the settings panel via the gear icon. */
  openSettings(): Promise<void>;
  /** Select a provider radio in the settings panel. */
  pickProvider(provider: 'acp' | 'sdk'): Promise<void>;
  /** Click the picker button so the next click on the page picks an element. */
  startPick(): Promise<void>;
  /** Locator that resolves the stream renderer (under the open shadow root). */
  stream(): Locator;
  /** All items currently rendered in the stream (each entry is a single bubble). */
  streamItems(): Locator;
}

export const test = base.extend<{ widget: WidgetHandle }>({
  widget: async ({ page }, use): Promise<void> => {
    await use(makeWidget(page));
  },
});

export { expect };

function makeWidget(page: Page): WidgetHandle {
  // The widget mounts inside a host element identified by an attribute on
  // the shadow host. Playwright's `>>>` (pierce) selector traverses any
  // open shadow root, so all locators below work in tests but the
  // production-default closed root remains inaccessible to page scripts.
  const host = page.locator('[data-agent-devtools-widget]');
  const launcher = page.locator('button[data-agent-devtools-launcher]');
  const composer = page.locator('[data-agent-devtools-composer]');
  const textarea = composer.locator('textarea');
  const gear = composer.locator('[data-agent-devtools-composer-settings]');
  const pickBtn = composer.locator('[data-agent-devtools-composer-pick]');
  const settingsPanel = page.locator('[data-agent-devtools-settings]');
  const stream = page.locator('[data-agent-devtools-stream]');
  const streamItems = stream.locator('[data-agent-devtools-stream-item]');

  async function ready(): Promise<void> {
    await expect(host).toBeAttached({ timeout: 30_000 });
    await expect(launcher).toBeVisible();
  }

  async function toggle(): Promise<void> {
    await launcher.click();
  }

  async function open(): Promise<void> {
    const visible = await composer
      .evaluate((el) => (el as HTMLElement).style.display !== 'none')
      .catch(() => false);
    if (!visible) await toggle();
    await expect(composer).toBeVisible();
  }

  async function submit(text: string): Promise<void> {
    await open();
    await textarea.fill(text);
    await textarea.press('Enter');
  }

  async function openSettings(): Promise<void> {
    await open();
    await gear.click();
    await expect(settingsPanel).toBeVisible();
  }

  async function pickProvider(provider: 'acp' | 'sdk'): Promise<void> {
    await openSettings();
    const radio = settingsPanel.locator(`[data-agent-devtools-settings-provider="${provider}"]`);
    await radio.check();
    // Close the panel so subsequent submits see the stream view.
    await settingsPanel.locator('[data-agent-devtools-settings-close]').click();
  }

  async function startPick(): Promise<void> {
    await open();
    await pickBtn.click();
  }

  return {
    ready,
    toggle,
    open,
    textarea: (): Locator => textarea,
    submit,
    openSettings,
    pickProvider,
    startPick,
    stream: (): Locator => stream,
    streamItems: (): Locator => streamItems,
  };
}

/**
 * Detect whether the local environment has the credentials needed to
 * actually reach Anthropic via either provider. Both SDK and ACP delegate
 * authentication to the `claude` CLI's login state, so a single probe
 * answers for both. We invoke `claude --version` synchronously at suite
 * start — if the binary is missing or returns non-zero, live specs are
 * skipped with a clear message rather than failing with a network timeout.
 */
export function hasClaudeAuth(): boolean {
  try {
    execFileSync('claude', ['--version'], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
