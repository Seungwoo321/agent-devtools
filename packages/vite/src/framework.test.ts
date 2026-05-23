import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  detectFramework,
  frameworkToImportFrom,
  resolveImportFrom,
  type Framework,
} from './framework.js';

function withTempProject(pkg: Record<string, unknown> | null): {
  root: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), 'agent-devtools-vite-fw-'));
  if (pkg !== null) {
    writeFileSync(join(root, 'package.json'), JSON.stringify(pkg), 'utf8');
  }
  return {
    root,
    cleanup: (): void => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

describe('frameworkToImportFrom', () => {
  it.each<[Framework, string]>([
    ['react', '@agent-devtools/react'],
    ['vue', '@agent-devtools/vue'],
    ['next', '@agent-devtools/next'],
    ['nuxt', '@agent-devtools/nuxt'],
  ])('maps %s → %s', (framework, expected) => {
    expect(frameworkToImportFrom(framework)).toBe(expected);
  });
});

describe('detectFramework', () => {
  let project: ReturnType<typeof withTempProject> | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });

  it('returns react when no package.json exists', () => {
    project = withTempProject(null);
    expect(detectFramework(project.root)).toBe('react');
  });

  it('returns react when package.json is malformed JSON', () => {
    project = withTempProject({});
    // Overwrite with garbage.
    writeFileSync(join(project.root, 'package.json'), '{ not json', 'utf8');
    expect(detectFramework(project.root)).toBe('react');
  });

  it('detects react from dependencies', () => {
    project = withTempProject({ dependencies: { react: '^19.0.0' } });
    expect(detectFramework(project.root)).toBe('react');
  });

  it('detects vue from devDependencies', () => {
    project = withTempProject({ devDependencies: { vue: '^3.5.0' } });
    expect(detectFramework(project.root)).toBe('vue');
  });

  it('detects next from dependencies (and prefers it over react)', () => {
    project = withTempProject({
      dependencies: { next: '^15.0.0', react: '^19.0.0' },
    });
    expect(detectFramework(project.root)).toBe('next');
  });

  it('detects nuxt from dependencies (and prefers it over vue)', () => {
    project = withTempProject({
      dependencies: { nuxt: '^3.13.0', vue: '^3.5.0' },
    });
    expect(detectFramework(project.root)).toBe('nuxt');
  });

  it('priority order: nuxt > next > vue > react', () => {
    project = withTempProject({
      dependencies: {
        react: '^19.0.0',
        vue: '^3.5.0',
        next: '^15.0.0',
        nuxt: '^3.13.0',
      },
    });
    expect(detectFramework(project.root)).toBe('nuxt');
  });

  it('returns react when no known framework is found', () => {
    project = withTempProject({ dependencies: { svelte: '^5.0.0' } });
    expect(detectFramework(project.root)).toBe('react');
  });
});

describe('resolveImportFrom', () => {
  let project: ReturnType<typeof withTempProject> | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });

  it('explicit importFrom wins over framework', () => {
    project = withTempProject({ dependencies: { vue: '^3.5.0' } });
    const result = resolveImportFrom(
      { framework: 'vue', importFrom: '@my-org/adapter' },
      project.root,
    );
    expect(result).toBe('@my-org/adapter');
  });

  it('explicit framework selects the matching adapter', () => {
    project = withTempProject({ dependencies: { react: '^19.0.0' } });
    expect(resolveImportFrom({ framework: 'vue' }, project.root)).toBe('@agent-devtools/vue');
    expect(resolveImportFrom({ framework: 'next' }, project.root)).toBe('@agent-devtools/next');
    expect(resolveImportFrom({ framework: 'nuxt' }, project.root)).toBe('@agent-devtools/nuxt');
  });

  it('framework: "auto" runs detectFramework', () => {
    project = withTempProject({ dependencies: { vue: '^3.5.0' } });
    expect(resolveImportFrom({ framework: 'auto' }, project.root)).toBe('@agent-devtools/vue');
  });

  it('undefined framework defaults to "auto"', () => {
    project = withTempProject({ dependencies: { next: '^15.0.0' } });
    expect(resolveImportFrom({}, project.root)).toBe('@agent-devtools/next');
  });

  it('auto-detect falls back to react when nothing matches', () => {
    project = withTempProject({});
    expect(resolveImportFrom({}, project.root)).toBe('@agent-devtools/react');
  });
});
