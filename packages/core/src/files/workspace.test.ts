import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { createWorkspace, PathOutsideWorkspaceError } from './workspace.js';

let root: string;
let outside: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agent-devtools-ws-'));
  outside = mkdtempSync(join(tmpdir(), 'agent-devtools-out-'));
  writeFileSync(join(root, 'inside.txt'), 'inside-content', 'utf8');
  writeFileSync(join(outside, 'secret.txt'), 'secret-content', 'utf8');
  mkdirSync(join(root, 'sub'), { recursive: true });
  writeFileSync(join(root, 'sub', 'nested.txt'), 'nested', 'utf8');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('createWorkspace', () => {
  it('rejects a non-existent root', () => {
    expect(() => createWorkspace(join(root, 'does-not-exist'))).toThrow(/does not exist/);
  });

  it('rejects a root that is a file, not a directory', () => {
    expect(() => createWorkspace(join(root, 'inside.txt'))).toThrow(/not a directory/);
  });

  it('canonicalises the root through symlinks', () => {
    const linkRoot = join(outside, 'link-to-root');
    symlinkSync(root, linkRoot, 'dir');
    const ws = createWorkspace(linkRoot);
    // The root we expose is the realpath, not the symlink path.
    expect(ws.root).not.toBe(linkRoot);
    expect(ws.root.endsWith(sep)).toBe(false);
  });
});

describe('Workspace.resolveForRead', () => {
  it('resolves a relative path to its canonical absolute form', () => {
    const ws = createWorkspace(root);
    expect(ws.resolveForRead('inside.txt')).toBe(join(ws.root, 'inside.txt'));
  });

  it('accepts an absolute path inside the root', () => {
    const ws = createWorkspace(root);
    expect(ws.resolveForRead(join(root, 'inside.txt'))).toBe(join(ws.root, 'inside.txt'));
  });

  it('rejects a `..` traversal escaping the root', () => {
    const ws = createWorkspace(root);
    expect(() => ws.resolveForRead('../outside-attempt.txt')).toThrow(PathOutsideWorkspaceError);
  });

  it('rejects an absolute path outside the root', () => {
    const ws = createWorkspace(root);
    expect(() => ws.resolveForRead(join(outside, 'secret.txt'))).toThrow(PathOutsideWorkspaceError);
  });

  it('rejects a symlink whose target lies outside the root', () => {
    const linkInside = join(root, 'escape-link');
    symlinkSync(join(outside, 'secret.txt'), linkInside);
    const ws = createWorkspace(root);
    expect(() => ws.resolveForRead('escape-link')).toThrow(PathOutsideWorkspaceError);
  });

  it('accepts a symlink whose target stays inside the root', () => {
    const linkInside = join(root, 'inside-link');
    symlinkSync(join(root, 'sub', 'nested.txt'), linkInside);
    const ws = createWorkspace(root);
    expect(ws.resolveForRead('inside-link')).toBe(join(ws.root, 'sub', 'nested.txt'));
  });

  it('throws ENOENT for a non-existent file', () => {
    const ws = createWorkspace(root);
    expect(() => ws.resolveForRead('not-there.txt')).toThrow(/ENOENT/);
  });
});

describe('Workspace.resolveForWrite', () => {
  it('returns canonical path for a new file in an existing directory', () => {
    const ws = createWorkspace(root);
    expect(ws.resolveForWrite('new-file.txt')).toBe(join(ws.root, 'new-file.txt'));
  });

  it('returns canonical path for a new file in a nested existing directory', () => {
    const ws = createWorkspace(root);
    expect(ws.resolveForWrite('sub/new-nested.txt')).toBe(join(ws.root, 'sub', 'new-nested.txt'));
  });

  it('rejects `..` escape even when leaf does not exist', () => {
    const ws = createWorkspace(root);
    expect(() => ws.resolveForWrite('../escape-target.txt')).toThrow(PathOutsideWorkspaceError);
  });

  it('rejects writing through a symlinked parent that points outside the root', () => {
    const linkParent = join(root, 'aliased-outside');
    symlinkSync(outside, linkParent, 'dir');
    const ws = createWorkspace(root);
    expect(() => ws.resolveForWrite('aliased-outside/new-file.txt')).toThrow(
      PathOutsideWorkspaceError,
    );
  });

  it('throws when the parent directory does not exist', () => {
    const ws = createWorkspace(root);
    expect(() => ws.resolveForWrite('missing-parent/leaf.txt')).toThrow(/ENOENT/);
  });
});
