/**
 * Framework resolution for the Vite plugin.
 *
 * The plugin can serve multiple frameworks (`@agent-devtools/{react,vue,next,nuxt}`).
 * Callers pick one with `framework: 'react' | 'vue' | 'next' | 'nuxt'` or leave it
 * as `'auto'` (default) and the resolver reads the host project's `package.json`
 * to pick the best match.
 *
 * Priority: `nuxt` > `next` > `vue` > `react`. The first match wins.
 *
 * Auto-detect is best-effort. If no match is found (or `package.json` is
 * missing/unreadable), we fall back to `react` — the original behaviour. The
 * resolver never throws.
 */
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

export type Framework = 'react' | 'vue' | 'next' | 'nuxt';

const FRAMEWORK_PRIORITY: readonly Framework[] = ['nuxt', 'next', 'vue', 'react'];

const FRAMEWORK_TO_IMPORT_FROM: Record<Framework, string> = {
  react: '@agent-devtools/react',
  vue: '@agent-devtools/vue',
  next: '@agent-devtools/next',
  nuxt: '@agent-devtools/nuxt',
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
  for (const candidate of FRAMEWORK_PRIORITY) {
    if (deps.has(candidate)) return candidate;
  }
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

function collectDeps(pkg: PackageJsonShape): Set<string> {
  const out = new Set<string>();
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    const map = pkg[section];
    if (!map || typeof map !== 'object') continue;
    for (const name of Object.keys(map)) out.add(name);
  }
  return out;
}
