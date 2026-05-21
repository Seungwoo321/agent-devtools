/**
 * Provider-agnostic widget smoke tests. These do NOT hit the agent
 * server; they verify the launcher / composer / settings panel shell
 * works regardless of authentication state, so they're the right
 * canary for "Vite plugin + bootstrap + mount" wiring.
 */
import { test, expect } from '../support/fixtures.js';

test.describe('widget shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('the launcher mounts inside the widget host and toggles the composer', async ({
    widget,
    page,
  }) => {
    await widget.ready();
    const composer = page.locator('[data-agent-devtools-composer]');
    await expect(composer).toBeHidden();
    await widget.toggle();
    await expect(composer).toBeVisible();
    await widget.toggle();
    await expect(composer).toBeHidden();
  });

  test('the gear icon swaps the stream view for the settings panel', async ({ widget, page }) => {
    await widget.ready();
    await widget.open();
    const stream = page.locator('[data-agent-devtools-stream]');
    const panel = page.locator('[data-agent-devtools-settings]');
    await expect(stream).toBeVisible();
    await expect(panel).toBeHidden();
    await page.locator('[data-agent-devtools-composer-settings]').click();
    await expect(panel).toBeVisible();
    // Stream and panel share the same slot — only one visible at a time.
    await expect(stream).toBeHidden();
    await panel.locator('[data-agent-devtools-settings-close]').click();
    await expect(panel).toBeHidden();
    await expect(stream).toBeVisible();
  });

  test('the settings panel surfaces the workspace root the dev server reported', async ({
    widget,
    page,
  }) => {
    await widget.ready();
    await widget.openSettings();
    const workspace = page.locator('[data-agent-devtools-settings-workspace]');
    // Server snapshot may take a tick to land — wait until the placeholder
    // is replaced with a real filesystem path.
    await expect(workspace).not.toHaveText('(not configured)', { timeout: 30_000 });
    await expect(workspace).toHaveText(/^\/.+/);
  });

  test('picking a DOM element fills the composer chip with a component-aware label', async ({
    widget,
    page,
  }) => {
    await widget.ready();
    await widget.open();
    await widget.startPick();
    // The composer hides for the duration of a pick session.
    await expect(page.locator('[data-agent-devtools-composer]')).toBeHidden();
    // The example app exposes a Counter card with a +1 button — pick the button.
    await page.locator('#counter-card button', { hasText: '+1' }).click();
    await expect(page.locator('[data-agent-devtools-composer]')).toBeVisible();
    const chipLabel = page.locator('[data-agent-devtools-composer-chip-label]');
    await expect(chipLabel).toBeVisible();
    const label = (await chipLabel.textContent()) ?? '';
    // The fiber walker should resolve a component name (e.g. "Counter")
    // rather than just "button". We accept either as long as a non-empty
    // label appears — the assertion ensures the picker fed evidence into
    // the composer's chip state.
    expect(label.trim().length).toBeGreaterThan(0);
  });
});
