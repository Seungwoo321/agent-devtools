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
    ['vue2', '@agent-devtools/vue2'],
    ['next', '@agent-devtools/next'],
    ['next-pages', '@agent-devtools/next-pages'],
    ['nuxt', '@agent-devtools/nuxt'],
    ['nuxt2', '@agent-devtools/nuxt2'],
    ['angular', '@agent-devtools/angular'],
    ['svelte', '@agent-devtools/svelte'],
    ['sveltekit', '@agent-devtools/sveltekit'],
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

  it('detects vue2 when the vue version range targets 2.x', () => {
    project = withTempProject({ dependencies: { vue: '^2.7.0' } });
    expect(detectFramework(project.root)).toBe('vue2');
  });

  it.each(['2.7.16', '~2.6.14', '^2.7.0', '>=2.6.0 <3', '>=2 <3', '2', 'npm:vue@2.7.16'])(
    'treats vue %s as vue2',
    (range) => {
      project = withTempProject({ dependencies: { vue: range } });
      expect(detectFramework(project.root)).toBe('vue2');
    },
  );

  it.each(['3.5.0', '^3.0.0', '~3.4.21', 'latest', ''])(
    'treats vue %s (non-2.x or ambiguous) as vue 3',
    (range) => {
      project = withTempProject({ dependencies: { vue: range } });
      expect(detectFramework(project.root)).toBe('vue');
    },
  );

  it('detects next from dependencies (and prefers it over react)', () => {
    project = withTempProject({
      dependencies: { next: '^15.0.0', react: '^19.0.0' },
    });
    expect(detectFramework(project.root)).toBe('next');
  });

  it('auto-detection never resolves to next-pages even with a next dep (opt-in only)', () => {
    project = withTempProject({
      dependencies: { next: '^14.0.0', react: '^18.0.0' },
    });
    expect(detectFramework(project.root)).toBe('next');
  });

  it('detects nuxt from dependencies (and prefers it over vue)', () => {
    project = withTempProject({
      dependencies: { nuxt: '^3.13.0', vue: '^3.5.0' },
    });
    expect(detectFramework(project.root)).toBe('nuxt');
  });

  it('detects nuxt2 when the nuxt version range targets 2.x', () => {
    project = withTempProject({ dependencies: { nuxt: '^2.17.0', vue: '^2.7.0' } });
    expect(detectFramework(project.root)).toBe('nuxt2');
  });

  it.each(['2.15.8', '~2.16.3', '^2.17.0', '>=2.15 <3', '2', 'npm:nuxt@2.17.0'])(
    'treats nuxt %s as nuxt2',
    (range) => {
      project = withTempProject({ dependencies: { nuxt: range } });
      expect(detectFramework(project.root)).toBe('nuxt2');
    },
  );

  it.each(['3.13.0', '^3.0.0', 'latest', ''])(
    'treats nuxt %s (non-2.x or ambiguous) as nuxt 3',
    (range) => {
      project = withTempProject({ dependencies: { nuxt: range } });
      expect(detectFramework(project.root)).toBe('nuxt');
    },
  );

  it('detects angular from @angular/core dependency', () => {
    project = withTempProject({ dependencies: { '@angular/core': '^17.0.0' } });
    expect(detectFramework(project.root)).toBe('angular');
  });

  it('detects svelte from dependencies', () => {
    project = withTempProject({ dependencies: { svelte: '^5.0.0' } });
    expect(detectFramework(project.root)).toBe('svelte');
  });

  it('detects sveltekit from @sveltejs/kit dependency (and prefers it over svelte)', () => {
    project = withTempProject({
      dependencies: { '@sveltejs/kit': '^2.0.0', svelte: '^5.0.0' },
    });
    expect(detectFramework(project.root)).toBe('sveltekit');
  });

  it('priority order: sveltekit > nuxt > next > angular > svelte > vue > react', () => {
    project = withTempProject({
      dependencies: {
        react: '^19.0.0',
        vue: '^3.5.0',
        '@angular/core': '^17.0.0',
        next: '^15.0.0',
        nuxt: '^3.13.0',
        svelte: '^5.0.0',
        '@sveltejs/kit': '^2.0.0',
      },
    });
    expect(detectFramework(project.root)).toBe('sveltekit');
  });

  it('prefers angular over vue when both are present', () => {
    project = withTempProject({
      dependencies: { '@angular/core': '^17.0.0', vue: '^3.5.0' },
    });
    expect(detectFramework(project.root)).toBe('angular');
  });

  it('prefers svelte over vue when both are present', () => {
    project = withTempProject({
      dependencies: { svelte: '^5.0.0', vue: '^3.5.0' },
    });
    expect(detectFramework(project.root)).toBe('svelte');
  });

  it('returns react when no known framework is found', () => {
    project = withTempProject({ dependencies: { lodash: '^4.0.0' } });
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
    expect(resolveImportFrom({ framework: 'vue2' }, project.root)).toBe('@agent-devtools/vue2');
    expect(resolveImportFrom({ framework: 'next' }, project.root)).toBe('@agent-devtools/next');
    expect(resolveImportFrom({ framework: 'next-pages' }, project.root)).toBe(
      '@agent-devtools/next-pages',
    );
    expect(resolveImportFrom({ framework: 'nuxt' }, project.root)).toBe('@agent-devtools/nuxt');
    expect(resolveImportFrom({ framework: 'nuxt2' }, project.root)).toBe('@agent-devtools/nuxt2');
    expect(resolveImportFrom({ framework: 'angular' }, project.root)).toBe(
      '@agent-devtools/angular',
    );
    expect(resolveImportFrom({ framework: 'svelte' }, project.root)).toBe('@agent-devtools/svelte');
    expect(resolveImportFrom({ framework: 'sveltekit' }, project.root)).toBe(
      '@agent-devtools/sveltekit',
    );
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
