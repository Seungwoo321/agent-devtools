#!/usr/bin/env node
// Layer-1 dev-only guard regression check for examples/nuxt.
// Fails the build if any widget-chain symbol appears in the production
// .output bundle. The substring "agent-devtools" alone is intentionally
// NOT forbidden — the example's own template renders that string as
// user-visible content. We forbid the actual code identifiers that would
// only appear if the widget chain leaked through the bundler.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Note: `__reactFiber$` is a React DOM internal that ships in every React
// production bundle (used by React itself + React DevTools). It is NOT a
// devtools-widget identifier and is excluded here to avoid false positives
// on adapters that coexist with React on the same host page.
const FORBIDDEN_SYMBOLS = [
  'mountAgentDevtools',
  'mountAgentDevtoolsVue',
  'createDefaultTransport',
  'StreamSilentError',
  'getFiberForElement',
  'pumpToSse',
  'describePicked',
  'walkComponentAncestors',
];

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json', '.html', '.css', '.map', '.txt']);

const here = fileURLToPath(new URL('.', import.meta.url));
const outputDir = join(here, '..', '.output');

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

let scanned = 0;
const hits = [];

try {
  await stat(outputDir);
} catch {
  console.error(`No build output at ${outputDir}. Run \`pnpm build\` first.`);
  process.exit(2);
}

for await (const file of walk(outputDir)) {
  if (!(await isTextFile(file))) continue;
  scanned += 1;
  const content = await readFile(file, 'utf8');
  for (const symbol of FORBIDDEN_SYMBOLS) {
    if (content.includes(symbol)) {
      hits.push({ file, symbol });
    }
  }
}

if (hits.length > 0) {
  console.error(
    `Dev-only guard breach: ${String(hits.length)} symbol(s) leaked into production output.`,
  );
  for (const { file, symbol } of hits) {
    console.error(`  ${file} contains ${symbol}`);
  }
  process.exit(1);
}

process.stdout.write(
  `OK: scanned ${String(scanned)} text file(s), no widget-chain symbols leaked.\n`,
);
