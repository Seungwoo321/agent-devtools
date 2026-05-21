/**
 * Live end-to-end coverage against BOTH provider runtimes:
 *
 *   1. ACP — `@agentclientprotocol/claude-agent-acp` runs the local
 *      `claude` CLI as a subprocess via JSON-RPC stdio.
 *   2. SDK — `@anthropic-ai/claude-agent-sdk` calls `query()` in-process
 *      using the same Pro subscription auth as the CLI.
 *
 * Both providers ultimately consume the user's Anthropic Pro 5h quota.
 * Each spec uses a short prompt and a generous wait (the model can
 * spend 10–30s on a turn). Skip the suite when the `claude` CLI isn't
 * authenticated so the runner stays useful on machines without a Pro
 * subscription.
 *
 * Assertions are deliberately weak about CONTENT — we never assert
 * specific assistant phrasing because that's not stable across model
 * versions. We assert STRUCTURE: a user bubble appears, an assistant
 * bubble appears, and no error bubble was rendered.
 */
import { test, expect, hasClaudeAuth } from '../support/fixtures.js';

test.describe('live providers', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !hasClaudeAuth(),
      'The `claude` CLI is not on PATH or returned non-zero. Live provider specs require ' +
        'a Pro subscription logged in via `claude` (both ACP and SDK delegate auth to it).',
    );
    await page.goto('/');
  });

  test('ACP provider answers a one-shot prompt with at least one assistant message', async ({
    widget,
    page,
  }) => {
    await widget.ready();
    await widget.pickProvider('acp');
    await widget.submit('Reply with the single word: ready');

    const items = widget.streamItems();
    // First item is the user echo; the assistant turn follows. Allow the
    // model up to a minute — Pro can be slow under load.
    await expect(items).toHaveCount(2, { timeout: 90_000 });

    const errors = page.locator('[data-agent-devtools-stream-item][data-kind="error"]');
    await expect(errors).toHaveCount(0);
  });

  test('SDK provider answers after the user toggles the provider radio', async ({
    widget,
    page,
  }) => {
    await widget.ready();
    await widget.pickProvider('sdk');
    await widget.submit('Reply with the single word: ready');

    const items = widget.streamItems();
    await expect(items).toHaveCount(2, { timeout: 90_000 });

    const errors = page.locator('[data-agent-devtools-stream-item][data-kind="error"]');
    await expect(errors).toHaveCount(0);
  });

  test('the picked element is forwarded in the request payload', async ({ widget, page }) => {
    await widget.ready();
    // Capture the next /v1/agent/stream POST and read its body for
    // assertions. We accept either same-origin (`/__agent_devtools/...`)
    // or the raw upstream URL — depending on the plugin proxy version.
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/v1/agent/stream') && req.method() === 'POST',
      { timeout: 90_000 },
    );

    await widget.startPick();
    // Pick the Counter's +1 button so the request carries evidence about
    // a known DOM node (not just the body).
    await page.locator('#counter-card button', { hasText: '+1' }).click();
    await expect(page.locator('[data-agent-devtools-composer]')).toBeVisible();
    await widget.submit('What does this button do?');

    const request = await requestPromise;
    const body = JSON.parse(request.postData() ?? '{}') as {
      prompt?: string;
      context?: {
        picked?: {
          tagName?: string;
          outerHTML?: string;
          source?: { fileName?: string; lineNumber?: number };
        };
        pageContext?: { picked?: { tagName?: string } };
      };
      provider?: string;
      permissionMode?: string;
    };

    expect(body.prompt).toContain('What does this button do?');
    // Settings panel default is `acp` + `acceptEdits` — confirm the
    // payload carries them rather than relying on server-side defaults.
    expect(body.provider).toBe('acp');
    expect(body.permissionMode).toBe('acceptEdits');
    // The picked element should be present at both call sites: the
    // top-level `context.picked` mirror (for backward compat) and the
    // primary `context.pageContext.picked` (the canonical position).
    expect(body.context?.picked?.tagName?.toUpperCase()).toBe('BUTTON');
    expect(body.context?.pageContext?.picked?.tagName?.toUpperCase()).toBe('BUTTON');
    expect(body.context?.picked?.outerHTML).toContain('+1');
    // Regression net for the React 19 `_debugStack` resolver: the picked
    // element must carry an authored source file (Vite dev URLs resolve
    // to workspace-relative `.tsx` paths). Without this assertion, a
    // future regression that silently drops the source field would
    // pass — and the agent would lose the "where in the codebase" cue.
    const pickedSource = body.context?.picked?.source;
    expect(pickedSource?.fileName).toBeDefined();
    expect(pickedSource?.fileName?.endsWith('.tsx')).toBe(true);
    expect(typeof pickedSource?.lineNumber).toBe('number');
  });
});
