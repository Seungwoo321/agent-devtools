/**
 * Unit tests for the html runner's pure helpers — argv parsing and entry
 * resolution. The dev-server boot (`runHtmlServer` / `runCli`) is covered by
 * the example smoke run; this file exists to lock down the new file-vs-folder
 * branch so a future refactor cannot silently regress the CLI contract.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, resolveEntry } from './index.js';

function withTmpDir<T>(fn: (dir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'html-cli-'));
  return Promise.resolve(fn(dir)).finally(() => {
    rmSync(dir, { recursive: true, force: true });
  });
}

describe('parseArgs', () => {
  it('defaults to "." when no positional is given', () => {
    expect(parseArgs([])).toEqual({
      path: '.',
      port: undefined,
      shadowOpen: false,
      help: false,
    });
  });

  it('captures a positional path', () => {
    expect(parseArgs(['./pages'])).toMatchObject({ path: './pages' });
  });

  it('treats -h and --help as help requests', () => {
    expect(parseArgs(['-h']).help).toBe(true);
    expect(parseArgs(['--help']).help).toBe(true);
  });

  it('reads --open-shadow as a boolean flag', () => {
    expect(parseArgs(['--open-shadow']).shadowOpen).toBe(true);
  });

  it('reads --port <n> in the next argv slot', () => {
    expect(parseArgs(['--port', '3210']).port).toBe(3210);
  });

  it('reads --port=<n> in the same argv slot', () => {
    expect(parseArgs(['--port=4000']).port).toBe(4000);
  });

  it('mixes positional + flags in any order', () => {
    expect(parseArgs(['./pages', '--port', '5555', '--open-shadow'])).toEqual({
      path: './pages',
      port: 5555,
      shadowOpen: true,
      help: false,
    });
    expect(parseArgs(['--open-shadow', '--port=7777', './x.html'])).toEqual({
      path: './x.html',
      port: 7777,
      shadowOpen: true,
      help: false,
    });
  });

  it('rejects an unknown flag', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/unknown argument: --nope/);
  });

  it('rejects a non-integer --port', () => {
    expect(() => parseArgs(['--port', 'abc'])).toThrow(/--port requires an integer/);
    expect(() => parseArgs(['--port=0'])).toThrow(/--port requires an integer/);
    expect(() => parseArgs(['--port=70000'])).toThrow(/--port requires an integer/);
  });

  it('rejects a missing --port value', () => {
    expect(() => parseArgs(['--port'])).toThrow(/--port requires an integer/);
  });
});

describe('resolveEntry', () => {
  it('returns the absolute folder + entryFile=null for a directory', () =>
    withTmpDir((dir) => {
      const resolved = resolveEntry(dir);
      expect(resolved).toEqual({ root: dir, entryFile: null });
    }));

  it('resolves a relative directory against the provided cwd', () =>
    withTmpDir((dir) => {
      const resolved = resolveEntry('.', dir);
      expect(resolved).toEqual({ root: dir, entryFile: null });
    }));

  it('returns parent + basename for a .html file', () =>
    withTmpDir((dir) => {
      const file = join(dir, 'about.html');
      writeFileSync(file, '<!doctype html><title>hi</title>');
      expect(resolveEntry(file)).toEqual({ root: dir, entryFile: 'about.html' });
    }));

  it('also accepts .htm (case-insensitive)', () =>
    withTmpDir((dir) => {
      const file = join(dir, 'LANDING.HTM');
      writeFileSync(file, '<!doctype html>');
      expect(resolveEntry(file)).toEqual({ root: dir, entryFile: 'LANDING.HTM' });
    }));

  it('resolves a relative file path against the provided cwd', () =>
    withTmpDir((dir) => {
      writeFileSync(join(dir, 'page.html'), '<!doctype html>');
      const resolved = resolveEntry('./page.html', dir);
      expect(resolved).toEqual({ root: dir, entryFile: 'page.html' });
    }));

  it('throws a clear error when the path does not exist', () =>
    withTmpDir((dir) => {
      const missing = join(dir, 'nope.html');
      expect(() => resolveEntry(missing)).toThrow(/path does not exist:/);
      expect(() => resolveEntry(missing)).toThrow(
        new RegExp(missing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );
    }));

  it('throws when the file extension is not html/htm', () =>
    withTmpDir((dir) => {
      const file = join(dir, 'notes.txt');
      writeFileSync(file, 'plain text');
      expect(() => resolveEntry(file)).toThrow(/path is not an HTML file:/);
      expect(() => resolveEntry(file)).toThrow(/expected one of: \.html, \.htm/);
    }));
});
