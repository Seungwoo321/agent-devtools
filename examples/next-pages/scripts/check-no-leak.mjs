#!/usr/bin/env node
// Layer-1 dev-only guard regression check for examples/next-pages.
// Fails the build if any widget-chain symbol appears in the production
// .next/ bundle. The substring "agent-devtools" alone is intentionally
// NOT forbidden — the example's own template may render that string as
// user-visible content. We forbid actual code identifiers that would
// only appear if the widget chain leaked through the bundler.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Note: `__reactFiber$` is a React DOM internal that ships in every React
// production bundle (used by React itself + React DevTools). It is NOT a
// devtools-widget identifier and is excluded here to avoid false positives.
const FORBIDDEN_SYMBOLS = [
  'mountAgentDevtools',
  'mountAgentDevtoolsNextPages',
  'createDefaultTransport',
  'StreamSilentError',
  'getFiberForElement',
  'pumpToSse',
  'describePicked',
  'walkComponentAncestors',
];

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json', '.html', '.css', '.map', '.txt']);

// Next.js writes some development-only artifacts into .next/cache and
// .next/types even during a production build. Those are not shipped to
// users and would create false positives. We scope the scan to the
// directories that contain the actual runtime artifacts.
const SCAN_SUBDIRS = ['static', 'server'];

const here = fileURLToPath(new URL('.', import.meta.url));
const outputDir = join(here, '..', '.next');

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
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

let scanned = 0;
const hits = [];

try {
  await stat(outputDir);
} catch {
  process.stderr.write(`No build output at ${outputDir}. Run \`pnpm build\` first.\n`);
  process.exit(2);
}

for (const sub of SCAN_SUBDIRS) {
  const subDir = join(outputDir, sub);
  for await (const file of walk(subDir)) {
    if (!(await isTextFile(file))) continue;
    scanned += 1;
    const content = await readFile(file, 'utf8');
    for (const symbol of FORBIDDEN_SYMBOLS) {
      if (content.includes(symbol)) {
        hits.push({ file: file.split(sep).slice(-4).join(sep), symbol });
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
  `OK: scanned ${String(scanned)} text file(s), no widget-chain symbols leaked.\n`,
);
