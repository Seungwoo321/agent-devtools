#!/usr/bin/env node
// Layer-1 dev-only guard regression check for examples/nuxt2.
// Fails the build if any widget-chain symbol appears in the production
// .nuxt/dist bundle. Nuxt 2 with `ssr: true` emits the production client
// chunks to `.nuxt/dist/client/` and the server bundle to
// `.nuxt/dist/server/`; both are scanned. The substring "agent-devtools"
// alone is intentionally NOT forbidden — the example's own template
// renders that string as user-visible content. We forbid the actual code
// identifiers that would only appear if the widget chain leaked through
// the bundler.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_SYMBOLS = [
  'mountAgentDevtools',
  'mountAgentDevtoolsVue2',
  'createDefaultTransport',
  'StreamSilentError',
  'getComponentInstanceForElement',
  'pumpToSse',
  'describePickedVue2',
  'walkComponentAncestors',
];

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json', '.html', '.css', '.map', '.txt']);

const here = fileURLToPath(new URL('.', import.meta.url));
const candidates = [
  join(here, '..', '.nuxt', 'dist', 'client'),
  join(here, '..', '.nuxt', 'dist', 'server'),
];

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

async function isTextFile(path) {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return false;
  return TEXT_EXTENSIONS.has(path.slice(dot));
}

const presentDirs = [];
for (const dir of candidates) {
  try {
    await stat(dir);
    presentDirs.push(dir);
  } catch {
    // missing — recorded below
  }
}

if (presentDirs.length === 0) {
  process.stderr.write(`No build output under .nuxt/dist. Run \`pnpm build\` first.\n`);
  process.exit(2);
}

let scanned = 0;
const hits = [];

for (const dir of presentDirs) {
  for await (const file of walk(dir)) {
    if (!(await isTextFile(file))) continue;
    scanned += 1;
    const content = await readFile(file, 'utf8');
    for (const symbol of FORBIDDEN_SYMBOLS) {
      if (content.includes(symbol)) {
        hits.push({ file, symbol });
      }
    }
  }
}

if (hits.length > 0) {
  process.stderr.write(
    `Dev-only guard breach: ${String(hits.length)} symbol(s) leaked into production output.\n`,
  );
  for (const { file, symbol } of hits) {
    process.stderr.write(`  ${file} contains ${symbol}\n`);
  }
  process.exit(1);
}

process.stdout.write(
  `OK: scanned ${String(scanned)} text file(s) across ${String(presentDirs.length)} bundle dir(s), no widget-chain symbols leaked.\n`,
);
