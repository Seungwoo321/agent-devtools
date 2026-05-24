/**
 * Framework resolution for the Vite plugin.
 *
 * The plugin can serve multiple frameworks
 * (`@agent-devtools/{react,vue,vue2,next,next-pages,nuxt,nuxt2,angular,svelte,sveltekit}`).
 * Callers pick one with `framework` or leave it as `'auto'` (default) and
 * the resolver reads the host project's `package.json` to pick the best
 * match.
 *
 * Priority: `sveltekit` > `nuxt`/`nuxt2` > `next` > `angular` > `svelte` >
 * `vue`/`vue2` > `react`. The first match wins. For `vue`/`vue2`, the
 * version constraint of the `vue` dependency decides: `^2.x` → `vue2`,
 * `^3.x` (or anything else) → `vue`. The same rule selects between
 * `nuxt` and `nuxt2`: a Nuxt 2.x range on the `nuxt` dependency picks
 * `nuxt2`, anything else picks `nuxt`.
 *
 * `next-pages` is intentionally never auto-detected — Pages Router and
 * App Router projects share the same `next` dependency, so the choice is
 * opt-in via explicit `framework: 'next-pages'`. Auto-detection of a
 * `next` dependency resolves to the App Router adapter
 * (`@agent-devtools/next`), which is the modern default.
 *
 * Auto-detect is best-effort. If no match is found (or `package.json` is
 * missing/unreadable), we fall back to `react` — the original behaviour. The
 * resolver never throws.
 */
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

export type Framework =
  | 'react'
  | 'vue'
  | 'vue2'
  | 'next'
  | 'next-pages'
  | 'nuxt'
  | 'nuxt2'
  | 'angular'
  | 'svelte'
  | 'sveltekit';

const FRAMEWORK_TO_IMPORT_FROM: Record<Framework, string> = {
  react: '@agent-devtools/react',
  vue: '@agent-devtools/vue',
  vue2: '@agent-devtools/vue2',
  next: '@agent-devtools/next',
  'next-pages': '@agent-devtools/next-pages',
  nuxt: '@agent-devtools/nuxt',
  nuxt2: '@agent-devtools/nuxt2',
  angular: '@agent-devtools/angular',
  svelte: '@agent-devtools/svelte',
  sveltekit: '@agent-devtools/sveltekit',
};

export function frameworkToImportFrom(framework: Framework): string {
  return FRAMEWORK_TO_IMPORT_FROM[framework];
}

/**
 * Detect the framework from the host project's `package.json`. Scans
 * `dependencies`, `devDependencies`, and `peerDependencies` for any of the
 * known framework names in priority order. Returns `'react'` if nothing
 * matches or the file is unreadable — never throws.
 */
export function detectFramework(projectRoot: string): Framework {
  const pkg = readPackageJson(projectRoot);
  if (!pkg) return 'react';
  const deps = collectDeps(pkg);
  if (deps.has('@sveltejs/kit')) return 'sveltekit';
  if (deps.has('nuxt')) {
    const version = deps.get('nuxt');
    if (isNuxt2Version(version)) return 'nuxt2';
    return 'nuxt';
  }
  if (deps.has('next')) return 'next';
  if (deps.has('@angular/core')) return 'angular';
  if (deps.has('svelte')) return 'svelte';
  if (deps.has('vue')) {
    const version = deps.get('vue');
    if (isVue2Version(version)) return 'vue2';
    return 'vue';
  }
  if (deps.has('react')) return 'react';
  return 'react';
}

/**
 * Resolve the `importFrom` module specifier from the plugin options.
 *
 * Resolution order:
 *   1. Explicit `importFrom` — passes through verbatim.
 *   2. Explicit `framework` — maps to the matching `@agent-devtools/<framework>`.
 *   3. `framework: 'auto'` (or undefined) — runs `detectFramework(projectRoot)`.
 */
export function resolveImportFrom(
  options: { framework?: Framework | 'auto'; importFrom?: string },
  projectRoot: string,
): string {
  if (options.importFrom !== undefined) return options.importFrom;
  const framework = options.framework ?? 'auto';
  if (framework === 'auto') return frameworkToImportFrom(detectFramework(projectRoot));
  return frameworkToImportFrom(framework);
}

interface PackageJsonShape {
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
}

function readPackageJson(projectRoot: string): PackageJsonShape | null {
  const file = resolvePath(projectRoot, 'package.json');
  try {
    const raw = readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object') return null;
    return parsed as PackageJsonShape;
  } catch {
    return null;
  }
}

function collectDeps(pkg: PackageJsonShape): Map<string, string | undefined> {
  const out = new Map<string, string | undefined>();
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    const map = pkg[section];
    if (!map || typeof map !== 'object') continue;
    for (const [name, raw] of Object.entries(map)) {
      const version = typeof raw === 'string' ? raw : undefined;
      if (!out.has(name)) out.set(name, version);
    }
  }
  return out;
}

/**
 * Decide whether a `vue` dependency range targets Vue 2.
 *
 * We look at the FIRST numeric token of the version range. If it is `2`,
 * the range targets Vue 2; otherwise we fall through to Vue 3.
 * Accepts the common forms: `2.7.16`, `^2.7.0`, `~2.6.14`, `>=2.6 <3`,
 * `>=2 <3`, `2`, `npm:vue@2.7.16`. The trailing context is either a dot
 * (`2.6`), whitespace (`2 <3`), or end-of-string (plain `2`), so the
 * regex matches all three.
 *
 * We do not try to be exhaustive — only confident enough to flip the
 * import target when the user's `package.json` clearly says Vue 2.
 * Anything ambiguous falls through to Vue 3, which is the modern default.
 */
function isVue2Version(version: string | undefined): boolean {
  if (typeof version !== 'string') return false;
  const trimmed = version.trim();
  if (trimmed.length === 0) return false;
  const match = trimmed.match(/(?:^|[^0-9])([0-9]+)(?=[.\s]|$)/);
  if (!match) return false;
  return match[1] === '2';
}

/**
 * Decide whether a `nuxt` dependency range targets Nuxt 2. Follows the same
 * first-numeric-token heuristic as `isVue2Version` so the supported forms
 * (`2.15.8`, `^2.17.0`, `~2.16.3`, `>=2.15 <3`, `2`, `npm:nuxt@2.17.0`)
 * resolve consistently. Anything ambiguous falls through to Nuxt 3, which
 * is the modern default.
 */
function isNuxt2Version(version: string | undefined): boolean {
  if (typeof version !== 'string') return false;
  const trimmed = version.trim();
  if (trimmed.length === 0) return false;
  const match = trimmed.match(/(?:^|[^0-9])([0-9]+)(?=[.\s]|$)/);
  if (!match) return false;
  return match[1] === '2';
}
