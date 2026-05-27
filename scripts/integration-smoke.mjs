#!/usr/bin/env node
/* eslint-disable no-console -- CLI smoke status output goes to stdout/stderr by design */
// Integration smoke: boots every example's dev server in parallel batches,
// asserts the served bytes contain the dev-injected bootstrap reference
// (Layer 1 dev guard inverse — the symbols MUST appear in dev), and tears the
// server down cleanly. The set is the ten framework-adapter examples plus the
// plain-HTML runner example (@agent-devtools/html). The companion CI step
// `pnpm build:examples` already covers the Layer 1 production no-leak side for
// the same set — for the adapter examples by scanning the production bundle,
// and for the plain-HTML example by scanning the source HTML (which is what
// ships, since there is no build step) — so the two adjacent steps together
// validate both halves of the dev-only guard contract for every example in a
// single CI job. Fails fast on the first regression and prints which pair
// broke so the matrix expansion stays diagnosable.
//
// Why a bespoke Node script instead of Playwright: the e2e package boots
// a full browser per test and is gated on a separate job. The smoke here
// only needs HTTP-level evidence that the bundler injection ran (i.e. the
// served text contains `agent-devtools` somewhere reachable from the dev
// entry), which a single fetch per pair covers without the browser cost.

import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { setTimeout as wait } from 'node:timers/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Per-example metadata. `paths` is searched in order; the smoke passes as
// soon as one path contains `expect`. Ports are pinned by each example's
// dev script (see examples/*/package.json or vite/nuxt config), so the
// batches can run in parallel without collisions.
const EXAMPLES = [
  {
    name: 'react-vite',
    filter: '@agent-devtools/example-react-vite',
    port: 5173,
    paths: ['/', '/src/main.tsx'],
    expect: 'agent-devtools',
  },
  {
    name: 'vue-vite',
    filter: '@agent-devtools/example-vue-vite',
    port: 3200,
    paths: ['/', '/src/main.ts'],
    expect: 'agent-devtools',
  },
  {
    name: 'vue2-vite',
    filter: '@agent-devtools/example-vue2-vite',
    port: 3201,
    paths: ['/', '/src/main.ts'],
    expect: 'agent-devtools',
  },
  {
    name: 'angular-vite',
    filter: '@agent-devtools/example-angular-vite',
    port: 3202,
    paths: ['/', '/src/main.ts'],
    expect: 'agent-devtools',
  },
  {
    name: 'svelte-vite',
    filter: '@agent-devtools/example-svelte-vite',
    port: 3203,
    paths: ['/', '/src/main.ts'],
    expect: 'agent-devtools',
  },
  {
    name: 'sveltekit',
    filter: '@agent-devtools/example-sveltekit',
    port: 3204,
    paths: ['/', '/src/routes/+layout.svelte'],
    expect: 'agent-devtools',
  },
  {
    name: 'next',
    filter: '@agent-devtools/example-next',
    port: 3100,
    paths: ['/'],
    expect: 'agent-devtools',
  },
  {
    name: 'next-pages',
    filter: '@agent-devtools/example-next-pages',
    port: 3101,
    paths: ['/'],
    expect: 'agent-devtools',
  },
  {
    name: 'nuxt',
    filter: '@agent-devtools/example-nuxt',
    port: 3300,
    paths: ['/', '/_nuxt/'],
    expect: 'agent-devtools',
  },
  {
    name: 'nuxt2',
    filter: '@agent-devtools/example-nuxt2',
    port: 3301,
    paths: ['/_nuxt/app.js', '/'],
    expect: 'mountAgentDevtoolsVue',
  },
  // Plain HTML via the @agent-devtools/html runner — not a framework adapter.
  // The served page carries only the inline config script plus a
  // `<script type="module" src="/index.html?html-proxy…">` reference; Vite
  // externalizes the bootstrap (with the mountAgentDevtools call) into that
  // proxied module. So `/` does not contain `mountAgentDevtools`, but fetching
  // `/` first registers the proxy, and the subsequent proxy fetch resolves it —
  // the paths are tried in order within one retry pass, so this self-sequences.
  {
    name: 'html',
    filter: '@agent-devtools/example-html',
    port: 3210,
    paths: ['/', '/index.html?html-proxy&index=0.js'],
    expect: 'mountAgentDevtools',
  },
];

const PORT_READY_TIMEOUT_MS = 120_000;
const HTTP_TIMEOUT_MS = 30_000;
const FETCH_RETRY_WINDOW_MS = 120_000;
const FETCH_RETRY_DELAY_MS = 2_000;
const SHUTDOWN_GRACE_MS = 2_000;
const BATCH_SIZE = 3;

async function probeOneHost(host, port) {
  await new Promise((resolvePromise, rejectPromise) => {
    const sock = createConnection({ host, port }, () => {
      sock.end();
      resolvePromise();
    });
    sock.setTimeout(2_000, () => {
      sock.destroy();
      rejectPromise(new Error('socket-timeout'));
    });
    sock.on('error', rejectPromise);
  });
}

// Some dev servers (vite default, nitro/nuxt default) bind to `localhost`
// which on macOS resolves to ::1 first while CI Linux resolves to 127.0.0.1.
// Probe both so the smoke is stable across both environments without
// forcing every example config to pin host: '127.0.0.1'.
async function probePort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const hosts = ['127.0.0.1', '::1'];
  let lastErr;
  while (Date.now() < deadline) {
    for (const host of hosts) {
      try {
        await probeOneHost(host, port);
        return host;
      } catch (err) {
        lastErr = err;
      }
    }
    await wait(750);
  }
  throw new Error(
    `port ${port} not ready on either 127.0.0.1 or ::1 after ${timeoutMs}ms (last: ${lastErr?.message ?? 'unknown'})`,
  );
}

async function fetchWithTimeout(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    const text = await res.text();
    return { status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

function killTree(child) {
  if (!child || child.killed || child.pid == null) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      /* already dead */
    }
  }
}

async function runOne(example) {
  const label = `[${example.name}]`;
  console.log(`${label} starting dev server on :${example.port}`);
  const child = spawn('pnpm', ['--filter', example.filter, 'run', 'dev'], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});

  const earlyExit = new Promise((_, reject) => {
    child.on('exit', (code, signal) => {
      reject(
        new Error(`dev server for ${example.name} exited early (code=${code} signal=${signal})`),
      );
    });
  });

  try {
    const reachableHost = await Promise.race([
      probePort(example.port, PORT_READY_TIMEOUT_MS),
      earlyExit,
    ]);
    const hostForUrl = reachableHost === '::1' ? '[::1]' : '127.0.0.1';
    // Webpack-based hosts (Nuxt 2, Angular) hold the port open while the
    // first bundle compiles, so the served body may be empty for tens of
    // seconds after the port becomes reachable. Retry across the paths
    // until the symbol appears or the retry window elapses.
    const fetchDeadline = Date.now() + FETCH_RETRY_WINDOW_MS;
    let lastFailure = '';
    while (Date.now() < fetchDeadline) {
      for (const path of example.paths) {
        const url = `http://${hostForUrl}:${example.port}${path}`;
        try {
          const { status, text } = await fetchWithTimeout(url, HTTP_TIMEOUT_MS);
          if (text.includes(example.expect)) {
            console.log(`${label} OK (${url} → contains "${example.expect}")`);
            return { name: example.name, ok: true };
          }
          lastFailure = `${url} HTTP ${status} did not contain "${example.expect}" (body len ${text.length})`;
        } catch (err) {
          lastFailure = `${url} fetch failed: ${err?.message ?? err}`;
        }
      }
      await wait(FETCH_RETRY_DELAY_MS);
    }
    throw new Error(`dev inject not detected for ${example.name}: ${lastFailure}`);
  } finally {
    killTree(child);
    await wait(SHUTDOWN_GRACE_MS);
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      /* gone */
    }
  }
}

async function runBatches(examples, size) {
  const failures = [];
  for (let i = 0; i < examples.length; i += size) {
    const batch = examples.slice(i, i + size);
    const results = await Promise.allSettled(batch.map(runOne));
    for (const [idx, result] of results.entries()) {
      if (result.status === 'rejected') {
        failures.push({
          name: batch[idx].name,
          error: result.reason?.message ?? String(result.reason),
        });
      }
    }
    if (failures.length > 0) break;
  }
  return failures;
}

const failures = await runBatches(EXAMPLES, BATCH_SIZE);
if (failures.length > 0) {
  console.error('\nIntegration smoke FAILED:');
  for (const f of failures) console.error(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
console.log(
  `\nIntegration smoke OK: ${EXAMPLES.length} example dev servers verified for dev injection.`,
);
