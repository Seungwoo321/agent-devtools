#!/usr/bin/env node
// Layer-1 dev-only guard regression check for examples/sveltekit.
// Fails the build if any widget-chain symbol appears in the SvelteKit build
// output: `build/` (node adapter), `.svelte-kit/output/`, and any nested
// client/server chunk dir SvelteKit emits.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_SYMBOLS = [
  'mountAgentDevtools',
  'mountAgentDevtoolsSvelte',
  'mountAgentDevtoolsSvelteKit',
  'createDefaultTransport',
  'StreamSilentError',
  'pumpToSse',
  'describePickedSvelte',
  'describePickedSvelteKit',
  'walkComponentAncestors',
];

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json', '.html', '.css', '.map', '.txt']);

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, '..');
const SCAN_DIRS = [join(root, 'build'), join(root, '.svelte-kit', 'output')];

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
const checkedDirs = [];

for (const dir of SCAN_DIRS) {
  try {
    await stat(dir);
  } catch {
    continue;
  }
  checkedDirs.push(dir);
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

if (checkedDirs.length === 0) {
  process.stderr.write(
    `No build output found. Run \`pnpm build\` first. Looked for: ${SCAN_DIRS.join(', ')}\n`,
  );
  process.exit(2);
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
  `OK: scanned ${String(scanned)} text file(s) across ${String(checkedDirs.length)} output dir(s), no widget-chain symbols leaked.\n`,
);
