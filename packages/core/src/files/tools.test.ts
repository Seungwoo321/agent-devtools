import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileTools } from './tools.js';
import { createWorkspace, PathOutsideWorkspaceError } from './workspace.js';

let root: string;
let outside: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agent-devtools-tools-'));
  outside = mkdtempSync(join(tmpdir(), 'agent-devtools-tools-out-'));
  writeFileSync(join(root, 'hello.txt'), 'hello world', 'utf8');
  writeFileSync(join(outside, 'forbidden.txt'), 'forbidden', 'utf8');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('FileTools.readFile', () => {
  it('reads a UTF-8 file inside the workspace', async () => {
    const tools = createFileTools(createWorkspace(root));
    expect(await tools.readFile('hello.txt')).toBe('hello world');
  });

  it('rejects a path escaping via `..`', async () => {
    const tools = createFileTools(createWorkspace(root));
    await expect(tools.readFile('../forbidden.txt')).rejects.toBeInstanceOf(
      PathOutsideWorkspaceError,
    );
  });

  it('rejects an absolute path outside the workspace', async () => {
    const tools = createFileTools(createWorkspace(root));
    await expect(tools.readFile(join(outside, 'forbidden.txt'))).rejects.toBeInstanceOf(
      PathOutsideWorkspaceError,
    );
  });

  it('rejects a symlink whose target is outside the workspace', async () => {
    symlinkSync(join(outside, 'forbidden.txt'), join(root, 'escape-link'));
    const tools = createFileTools(createWorkspace(root));
    await expect(tools.readFile('escape-link')).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
  });
});

describe('FileTools.editFile', () => {
  it('overwrites an existing file inside the workspace', async () => {
    const tools = createFileTools(createWorkspace(root));
    await tools.editFile('hello.txt', 'rewritten');
    expect(readFileSync(join(root, 'hello.txt'), 'utf8')).toBe('rewritten');
  });

  it('creates a new file inside the workspace', async () => {
    const tools = createFileTools(createWorkspace(root));
    await tools.editFile('new.txt', 'fresh');
    expect(readFileSync(join(root, 'new.txt'), 'utf8')).toBe('fresh');
  });

  it('rejects writing outside via `..`', async () => {
    const tools = createFileTools(createWorkspace(root));
    await expect(tools.editFile('../escape.txt', 'x')).rejects.toBeInstanceOf(
      PathOutsideWorkspaceError,
    );
  });

  it('rejects writing through a symlinked-out parent', async () => {
    symlinkSync(outside, join(root, 'aliased'), 'dir');
    const tools = createFileTools(createWorkspace(root));
    await expect(tools.editFile('aliased/new-secret.txt', 'leak')).rejects.toBeInstanceOf(
      PathOutsideWorkspaceError,
    );
    // The file MUST NOT have been written outside the workspace.
    expect(() => readFileSync(join(outside, 'new-secret.txt'), 'utf8')).toThrow(/ENOENT/);
  });
});
