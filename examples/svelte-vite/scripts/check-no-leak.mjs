#!/usr/bin/env node
// Layer-1 dev-only guard regression check for examples/svelte-vite.
// Fails the build if any widget-chain symbol appears in the production
// dist/ bundle.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_SYMBOLS = [
  'mountAgentDevtools',
  'mountAgentDevtoolsSvelte',
  'createDefaultTransport',
  'StreamSilentError',
  'pumpToSse',
  'describePickedSvelte',
  'walkComponentAncestors',
];

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json', '.html', '.css', '.map', '.txt']);

const here = fileURLToPath(new URL('.', import.meta.url));
const outputDir = join(here, '..', 'dist');

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
  process.stderr.write(`No build output at ${outputDir}. Run \`pnpm build\` first.\n`);
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
