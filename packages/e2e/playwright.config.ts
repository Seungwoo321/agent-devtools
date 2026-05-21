/**
 * Playwright config — end-to-end coverage for the agent-devtools widget.
 *
 * The suite drives `examples/react-vite` against LIVE provider runtimes:
 *
 *   - ACP (`@agentclientprotocol/claude-agent-acp`) — subprocess to the
 *     local `claude` CLI; requires `claude` on PATH and a logged-in Pro
 *     subscription.
 *   - SDK (`@anthropic-ai/claude-agent-sdk`) — in-process Anthropic
 *     subscription auth via `query()`; same prerequisite as ACP.
 *
 * Shadow DOM:
 *   The widget normally mounts inside a CLOSED shadow root so page
 *   scripts can't reach into its DOM. Playwright can't drive a closed
 *   root either — we flip it open via `AGENT_DEVTOOLS_OPEN_SHADOW=1`
 *   purely for the lifetime of the dev server the test boots.
 *
 * Single project / single worker:
 *   ACP and SDK both ultimately call out to the same Anthropic
 *   subscription. Running two tests in parallel against one Pro account
 *   amplifies the 5h rate-limit window without buying any signal. We
 *   serialize on a single worker, single browser project — fidelity
 *   over wall-clock speed.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 5183;
const BASE_URL = `http://localhost:${String(PORT)}`;

export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  // Live provider responses take seconds, not milliseconds. The model
  // can spend up to ~30s on a single turn; allow generously.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: './playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Avoid bumping into stale dev caches between specs.
    ignoreHTTPSErrors: false,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm --filter @agent-devtools/example-react-vite dev --port ' + String(PORT),
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      // Allow Playwright to pierce the widget's shadow root.
      AGENT_DEVTOOLS_OPEN_SHADOW: '1',
    },
  },
});
