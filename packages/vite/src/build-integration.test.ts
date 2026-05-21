/**
 * Production-leak guard: run an actual Vite `build()` against fixtures and
 * verify nothing related to the widget reaches the output bundle.
 *
 * Two layers are tested here:
 *   1. The PLUGIN guarantee (ADT-25 / `apply: 'serve'`) — even when the
 *      plugin is wired into a Vite config, a production build emits zero
 *      bootstrap.
 *   2. The USER PATTERN guarantee (ADT-29) — the recommended
 *      `if (import.meta.env.DEV) { await import('@agent-devtools/react') }`
 *      gate around the widget tree-shakes out of production. The fixture
 *      uses a local stub module with a unique sentinel identifier so the
 *      test doesn't depend on the @agent-devtools/react package being
 *      built; we're verifying the build pipeline's dead-code elimination,
 *      not the package contents.
 *
 * Running through the real Vite pipeline means a future misconfiguration
 * (a forgotten hook, a renamed plugin field, an inadvertent change to how
 * `import.meta.env.DEV` folds) surfaces here, not in a downstream
 * consumer's bundle.
 */
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { agentDevtools } from './plugin.js';

let fixtureRoot: string;
let pluginDir: string;
let devGateDir: string;

/**
 * Run a Vite `build()` while masquerading as the real `vite build` CLI.
 *
 * Vite folds `import.meta.env.DEV` to `false` only when `NODE_ENV` is
 * `'production'` at the moment its config is resolved. The real CLI sets
 * that itself before any user code runs; the programmatic API inherits
 * whatever the caller's process has — and vitest sets `NODE_ENV=test`.
 * Without this shim, every DEV-gated branch survives the build and the
 * tree-shaking assertion below would be testing the wrong universe.
 */
async function buildAsProduction(opts: Parameters<typeof build>[0]): Promise<void> {
  const env = (globalThis as { process: { env: Record<string, string | undefined> } }).process.env;
  const prev = env.NODE_ENV;
  env.NODE_ENV = 'production';
  try {
    await build(opts);
  } finally {
    if (prev === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = prev;
  }
}

beforeAll(async () => {
  // Stage fixtures inside the package (rather than the OS tmp dir) so
  // rolldown's "no paths outside root" guard is satisfied; the OS tmp
  // path resolves through a /private symlink on macOS and rolldown refuses
  // to emit chunks for it.
  fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '.tmp');
  await mkdir(fixtureRoot, { recursive: true });

  pluginDir = await realpath(await mkdtemp(join(fixtureRoot, 'adt-plugin-build-')));
  await writeFile(
    join(pluginDir, 'index.html'),
    `<!doctype html><html><head><title>t</title></head><body><div id="app"></div><script type="module" src="/main.js"></script></body></html>`,
  );
  await writeFile(
    join(pluginDir, 'main.js'),
    `document.getElementById('app').textContent = 'hello world';`,
  );

  devGateDir = await realpath(await mkdtemp(join(fixtureRoot, 'adt-devgate-build-')));
  await writeFile(
    join(devGateDir, 'index.html'),
    `<!doctype html><html><head><title>t</title></head><body><div id="app"></div><script type="module" src="/main.js"></script></body></html>`,
  );
  await writeFile(
    join(devGateDir, 'fake-widget.js'),
    [
      'export function __ADT_WIDGET_SENTINEL_FN__() {',
      `  return '__ADT_WIDGET_SENTINEL_PAYLOAD__';`,
      '}',
    ].join('\n'),
  );
  // Mirrors the README's recommended pattern: dev-only dynamic import.
  // In production, `import.meta.env.DEV` is folded to `false`, the
  // surrounding `if` becomes dead code, and the bundler eliminates the
  // dynamic import — so the sentinel module never enters the graph. We
  // deliberately avoid top-level await (which prevents some forms of
  // dead-code elimination across ESM module boundaries) and use the
  // `import().then(...)` form instead, which is what the docs will tell
  // users to write.
  await writeFile(
    join(devGateDir, 'main.js'),
    [
      'if (import.meta.env.DEV) {',
      "  import('./fake-widget.js').then((m) => m.__ADT_WIDGET_SENTINEL_FN__());",
      '}',
      "document.getElementById('app').textContent = 'hello world';",
    ].join('\n'),
  );
});

afterAll(async () => {
  if (pluginDir) await rm(pluginDir, { recursive: true, force: true });
  if (devGateDir) await rm(devGateDir, { recursive: true, force: true });
});

async function readAllOutputs(dir: string): Promise<string> {
  const out = join(dir, 'dist');
  const acc: string[] = [];
  async function walk(d: string): Promise<void> {
    const entries = await readdir(d, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        acc.push(await readFile(full, 'utf8'));
      }
    }
  }
  await walk(out);
  return acc.join('\n');
}

describe('plugin in production build', () => {
  it('does not inject the bootstrap into production HTML or JS bundles', async () => {
    await buildAsProduction({
      root: pluginDir,
      logLevel: 'silent',
      plugins: [agentDevtools()],
      build: { outDir: 'dist', emptyOutDir: true },
    });
    const combined = await readAllOutputs(pluginDir);
    expect(combined).not.toContain('mountAgentDevtools');
    expect(combined).not.toContain('@agent-devtools/react');
  }, 30000);
});

describe('user-side DEV-only dynamic import tree-shakes out in production', () => {
  it('emits no widget identifier or sentinel payload after a production build', async () => {
    await buildAsProduction({
      root: devGateDir,
      logLevel: 'silent',
      build: { outDir: 'dist', emptyOutDir: true },
    });
    const combined = await readAllOutputs(devGateDir);
    // The sentinel function and its payload should be eliminated entirely
    // because `import.meta.env.DEV` is `false` in a production build.
    expect(combined).not.toContain('__ADT_WIDGET_SENTINEL_FN__');
    expect(combined).not.toContain('__ADT_WIDGET_SENTINEL_PAYLOAD__');
    // Sanity: the rest of main.js — the unconditional line — IS in the
    // bundle, proving the build ran and only the gated branch was cut.
    expect(combined).toContain('hello world');
  }, 30000);
});
