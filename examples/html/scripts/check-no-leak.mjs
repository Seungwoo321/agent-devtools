#!/usr/bin/env node
// Dev-only guard regression check for examples/html.
//
// For a plain HTML site there is no production build — the files the planner
// commits and ships ARE the source `*.html`. So the "no leak" guarantee is
// that the widget chain never appears in those source files: the runner
// injects it at serve time only. This scan fails if any widget-chain symbol
// is ever baked into a shipped HTML file.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_SYMBOLS = [
  'mountAgentDevtools',
  'createDefaultTransport',
  '@agent-devtools',
  '__AGENT_DEVTOOLS_CONFIG__',
];

const here = fileURLToPath(new URL('.', import.meta.url));
const projectDir = join(here, '..');

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'scripts') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      yield full;
    }
  }
}

let scanned = 0;
const hits = [];

for await (const file of walk(projectDir)) {
  scanned += 1;
  const content = await readFile(file, 'utf8');
  for (const symbol of FORBIDDEN_SYMBOLS) {
    if (content.includes(symbol)) {
      hits.push({ file, symbol });
    }
  }
}

if (scanned === 0) {
  process.stderr.write('No HTML files found to scan.\n');
  process.exit(2);
}

if (hits.length > 0) {
  process.stderr.write(
    `Dev-only guard breach: ${String(hits.length)} symbol(s) baked into shipped HTML.\n`,
  );
  for (const { file, symbol } of hits) {
    process.stderr.write(`  ${file} contains ${symbol}\n`);
  }
  process.exit(1);
}

process.stdout.write(
  `OK: scanned ${String(scanned)} HTML file(s), no widget-chain symbols in source.\n`,
);
