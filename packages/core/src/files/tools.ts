import { readFile as fsReadFile, writeFile as fsWriteFile } from 'node:fs/promises';
import type { Workspace } from './workspace.js';

export interface FileTools {
  /** Read a UTF-8 text file inside the workspace root. */
  readFile(path: string): Promise<string>;
  /** Overwrite (or create) a UTF-8 text file inside the workspace root. */
  editFile(path: string, content: string): Promise<void>;
}

/**
 * Build FileTools bound to a workspace. Every path is canonicalised through the
 * workspace (read: full realpath; write: parent realpath + basename) so symlink
 * and `..` escape attempts surface as PathOutsideWorkspaceError before any FS
 * call. The tools are the only handles given to the agent layer for file I/O.
 */
export function createFileTools(workspace: Workspace): FileTools {
  return {
    async readFile(p: string): Promise<string> {
      const canonical = workspace.resolveForRead(p);
      return fsReadFile(canonical, 'utf8');
    },
    async editFile(p: string, content: string): Promise<void> {
      const canonical = workspace.resolveForWrite(p);
      await fsWriteFile(canonical, content, 'utf8');
    },
  };
}
