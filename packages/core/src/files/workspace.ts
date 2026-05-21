import { realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve, sep } from 'node:path';

export class PathOutsideWorkspaceError extends Error {
  constructor(
    public readonly attemptedPath: string,
    public readonly root: string,
  ) {
    super(`path resolves outside workspace root: ${attemptedPath} (root: ${root})`);
    this.name = 'PathOutsideWorkspaceError';
  }
}

export interface Workspace {
  /** Canonical absolute path of the workspace root (symlinks resolved). */
  readonly root: string;
  /**
   * Resolve a path for reading. The target file must exist; the result is its
   * canonical absolute path with all symlinks resolved. Throws
   * PathOutsideWorkspaceError if the canonical path is not inside the root.
   */
  resolveForRead(path: string): string;
  /**
   * Resolve a path for writing. The parent directory must exist; the result is
   * (canonical parent) + basename, so the boundary check still catches symlinked
   * parents pointing outside the root. The leaf itself does NOT need to exist.
   * Throws PathOutsideWorkspaceError if the result is not inside the root.
   */
  resolveForWrite(path: string): string;
}

export function createWorkspace(rootPath: string): Workspace {
  let canonicalRoot: string;
  try {
    canonicalRoot = realpathSync(rootPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`workspace root does not exist: ${rootPath}`, { cause: error });
    }
    throw error;
  }
  if (!statSync(canonicalRoot).isDirectory()) {
    throw new Error(`workspace root is not a directory: ${rootPath}`);
  }
  const rootBoundary = canonicalRoot.endsWith(sep) ? canonicalRoot : canonicalRoot + sep;

  function assertInside(canonical: string, original: string): void {
    if (canonical !== canonicalRoot && !canonical.startsWith(rootBoundary)) {
      throw new PathOutsideWorkspaceError(original, canonicalRoot);
    }
  }

  return {
    root: canonicalRoot,
    resolveForRead(p: string): string {
      const absolute = isAbsolute(p) ? p : resolve(canonicalRoot, p);
      // Boundary check first via the canonical parent — catches `..` escapes
      // even when the target doesn't exist (we don't want ENOENT to mask a
      // boundary violation).
      const parentCanonical = realpathSync(dirname(absolute));
      assertInside(resolve(parentCanonical, basename(absolute)), p);
      // Then the full canonicalization, which also resolves in-workspace
      // symlinks. A symlink pointing OUT of the workspace fails this second
      // check (defence in depth).
      const canonical = realpathSync(absolute);
      assertInside(canonical, p);
      return canonical;
    },
    resolveForWrite(p: string): string {
      const absolute = isAbsolute(p) ? p : resolve(canonicalRoot, p);
      const parentCanonical = realpathSync(dirname(absolute));
      const canonical = resolve(parentCanonical, basename(absolute));
      assertInside(canonical, p);
      return canonical;
    },
  };
}
