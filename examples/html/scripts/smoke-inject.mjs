#!/usr/bin/env node
// Live dev-injection smoke for examples/html.
//
// Boots the runner in-process against this folder, fetches each served page,
// and asserts the widget bootstrap was injected — the dev-side inverse of the
// no-leak check.
//
// The runner injects TWO tags into every served page:
//   1. a classic inline <script> that sets `__AGENT_DEVTOOLS_CONFIG__`
//      (baseUrl + the minted pairing token). This stays inline in the page
//      bytes, so it doubles as evidence that the loopback agent server spawned
//      and a token was minted (delivered via a window global, never the URL).
//   2. a <script type="module"> bootstrap that imports the widget chain and
//      calls mountAgentDevtools. Vite externalizes inline module scripts into a
//      virtual `?html-proxy` chunk, so the served page only carries a
//      `<script type="module" src="…?html-proxy…">` reference — the
//      `mountAgentDevtools` call lives in that proxied module, not in the page
//      bytes. We follow the proxy URL and assert the symbols there.
//
// Note: Vite rewrites the bootstrap's bare import specifier
// `@agent-devtools/widget-core` to a resolved URL (e.g. `/@fs/.../widget-core/
// dist/index.js` under a workspace, or `.vite/deps/@agent-devtools_widget-core
// .js` under a bare npx install). The literal scoped slug therefore does not
// survive the transform, but the `widget-core` package segment and the named
// imports (`mountAgentDevtools`, `createDefaultTransport`) do — so we assert on
// those, which is robust across both resolution paths.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runHtmlServer } from '@agent-devtools/html';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// Symbols that must appear inline in the served page bytes.
const INLINE_REQUIRED = ['__AGENT_DEVTOOLS_CONFIG__'];
// Symbols that must appear in the externalized bootstrap (?html-proxy) module.
// `widget-core` is the resolved import-path segment; the others are named
// imports the bootstrap calls. See the header note on Vite specifier rewriting.
const PROXY_REQUIRED = ['widget-core', 'mountAgentDevtools', 'createDefaultTransport'];
const PAGES = ['/', '/about.html'];
const FETCH_TIMEOUT_MS = 15_000;

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${String(res.status)} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Tear the dev server down with a bounded wait. The global fetch (undici)
// keeps pooled keep-alive sockets open, which the event loop has already
// unref'd, so Vite's httpServer.close() waits on connections that never
// resolve. We race the close against a short timer and then force-exit — this
// is a throwaway smoke process, so abandoning a hung close is correct.
async function closeQuietly(server) {
  if (!server) return;
  try {
    await Promise.race([server.close(), new Promise((r) => setTimeout(r, 3000))]);
  } catch {
    // best-effort shutdown
  }
}

// Extract the bootstrap module reference Vite externalized for this page.
function findProxyHref(html) {
  const match = html.match(/<script\b[^>]*\bsrc="([^"]*html-proxy[^"]*)"/i);
  return match ? match[1] : null;
}

let server;
const failures = [];

try {
  const started = await runHtmlServer({ root, port: 3211 });
  server = started.server;
  const base = started.url.replace(/\/$/, '');

  for (const page of PAGES) {
    const html = await fetchText(`${base}${page}`);

    for (const symbol of INLINE_REQUIRED) {
      if (!html.includes(symbol)) {
        failures.push(`${page} is missing inline symbol: ${symbol}`);
      }
    }

    const proxyHref = findProxyHref(html);
    if (!proxyHref) {
      failures.push(`${page} has no externalized bootstrap (?html-proxy) module reference`);
      continue;
    }

    const proxyJs = await fetchText(`${base}${proxyHref}`);
    for (const symbol of PROXY_REQUIRED) {
      if (!proxyJs.includes(symbol)) {
        failures.push(
          `${page} bootstrap module (${proxyHref}) is missing injected symbol: ${symbol}`,
        );
      }
    }
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
} finally {
  await closeQuietly(server);
}

if (failures.length > 0) {
  process.stderr.write('Dev-injection smoke FAILED:\n');
  for (const failure of failures) {
    process.stderr.write(`  - ${failure}\n`);
  }
  process.exit(1);
}

process.stdout.write(
  `OK: widget bootstrap injected into ${String(PAGES.length)} served page(s) with a minted pairing token.\n`,
);
process.exit(0);
