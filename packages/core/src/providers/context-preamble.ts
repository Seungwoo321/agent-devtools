/**
 * Render the widget's request-time `context` blob into a model-readable
 * preamble. Both providers prepend this to the user prompt so the agent
 * sees the picked-element evidence + page context as part of the user
 * turn:
 *
 *   - ACP provider sends it as a separate `text` content block, ahead of
 *     the user prompt block.
 *   - SDK provider concatenates it to the flat-string prompt (the
 *     SDK's `query({ prompt })` is string-only).
 *
 * Source slicing
 * --------------
 * The previous version of this formatter listed component source paths
 * but never the file contents — short prompts like "explain this" then
 * failed because the agent had a path but no code. v2 inlines a window
 * of source code around each named component in the picked element's
 * chain, gated on a workspace-bound `FileTools` so reads can never
 * escape the project root.
 *
 * Failure handling: if a slice read throws (path outside the workspace,
 * file disappeared, binary file), the slice is silently dropped. The
 * picked-element block still lists the path so the agent can fall back
 * to a `Read` tool call if it really needs the bytes.
 */
import type { FileTools } from '../files/index.js';

export interface FormatContextPreambleOptions {
  /**
   * Workspace-bound file reader. When supplied, the preamble inlines a
   * window of source code around each component in the picked element's
   * chain. Without it, the preamble still lists paths but ships no code.
   */
  readonly files?: FileTools;
  /**
   * Number of context lines before and after the target line per slice.
   * Default 8 (so a slice spans ~17 lines including the target).
   */
  readonly contextLines?: number;
  /**
   * Max source slices to include per request. Default 3 — the picked
   * leaf + a couple of parents; deeper ancestors are listed by path
   * only so the preamble stays under a few KB.
   */
  readonly maxSlices?: number;
}

const DEFAULT_CONTEXT_LINES = 8;
const DEFAULT_MAX_SLICES = 3;
const MAX_PAGE_FILES = 20;
const MAX_RECENT_ERRORS = 5;
const MAX_TEXT_PREVIEW = 200;

export async function formatContextPreamble(
  context: unknown,
  options: FormatContextPreambleOptions = {},
): Promise<string> {
  if (!context || typeof context !== 'object') return '';

  const c = context as Record<string, unknown>;
  const pageContext = isPlainObject(c.pageContext) ? c.pageContext : undefined;
  const picked = pickPicked(pageContext, c);

  const lines: string[] = [];

  appendPageContextBlock(lines, pageContext);
  appendPickedBlock(lines, picked);

  const slices = picked
    ? await collectSourceSlices(picked, {
        files: options.files,
        contextLines: options.contextLines ?? DEFAULT_CONTEXT_LINES,
        maxSlices: options.maxSlices ?? DEFAULT_MAX_SLICES,
      })
    : [];
  if (slices.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('[Source Slices]');
    for (const slice of slices) {
      lines.push('');
      lines.push(`--- ${slice.fileName} (around line ${String(slice.targetLine)}) ---`);
      lines.push(slice.body);
    }
  }

  return lines.join('\n');
}

function appendPageContextBlock(
  lines: string[],
  pageContext: Record<string, unknown> | undefined,
): void {
  if (!pageContext) return;
  const url = typeof pageContext.url === 'string' ? pageContext.url : undefined;
  const route = isPlainObject(pageContext.route) ? pageContext.route : undefined;
  const pageFiles = Array.isArray(pageContext.pageFiles) ? pageContext.pageFiles : [];
  const errors = Array.isArray(pageContext.errors) ? pageContext.errors : [];

  if (!url && !route && pageFiles.length === 0 && errors.length === 0) return;

  lines.push('[Page Context]');
  if (url) lines.push(`URL: ${url}`);
  if (route && typeof route.pathname === 'string') lines.push(`Route: ${route.pathname}`);
  if (pageFiles.length > 0) {
    lines.push('Page files:');
    for (const f of pageFiles.slice(0, MAX_PAGE_FILES)) {
      if (!isPlainObject(f)) continue;
      const file = typeof f.fileName === 'string' ? f.fileName : undefined;
      if (!file) continue;
      const comp = typeof f.componentName === 'string' ? ` :: ${f.componentName}` : '';
      lines.push(`  - ${file}${comp}`);
    }
  }
  if (errors.length > 0) {
    lines.push('Recent errors:');
    for (const e of errors.slice(0, MAX_RECENT_ERRORS)) {
      if (!isPlainObject(e)) continue;
      const msg = typeof e.message === 'string' ? e.message : undefined;
      if (msg) lines.push(`  - ${msg}`);
    }
  }
}

function appendPickedBlock(lines: string[], picked: Record<string, unknown> | undefined): void {
  if (!picked) return;

  if (lines.length > 0) lines.push('');
  lines.push('[Picked Element]');

  if (typeof picked.componentName === 'string') lines.push(`Component: ${picked.componentName}`);
  if (typeof picked.tagName === 'string') lines.push(`Tag: ${picked.tagName}`);
  if (typeof picked.selector === 'string') lines.push(`Selector: ${picked.selector}`);

  const src = isPlainObject(picked.source) ? picked.source : undefined;
  if (src && typeof src.fileName === 'string') {
    lines.push(`Source: ${formatSourceLocation(src)}`);
  }

  if (typeof picked.text === 'string' && picked.text.length > 0) {
    lines.push(`Text: ${picked.text.slice(0, MAX_TEXT_PREVIEW)}`);
  }

  const attributes = isPlainObject(picked.attributes) ? picked.attributes : undefined;
  if (attributes) {
    const entries = Object.entries(attributes).filter(([, v]) => typeof v === 'string');
    if (entries.length > 0) {
      lines.push('Attributes:');
      for (const [name, value] of entries) {
        lines.push(`  ${name}=${JSON.stringify(value)}`);
      }
    }
  }

  if (typeof picked.outerHTML === 'string' && picked.outerHTML.length > 0) {
    lines.push('Outer HTML:');
    lines.push('```html');
    lines.push(picked.outerHTML);
    lines.push('```');
  }

  const chain = Array.isArray(picked.componentChain) ? picked.componentChain : [];
  if (chain.length > 0) {
    lines.push('Component chain (leaf → root):');
    for (const entry of chain) {
      if (!isPlainObject(entry)) continue;
      const name = typeof entry.componentName === 'string' ? entry.componentName : '<anonymous>';
      const entrySrc = isPlainObject(entry.source) ? entry.source : undefined;
      const where =
        entrySrc && typeof entrySrc.fileName === 'string'
          ? ` — ${formatSourceLocation(entrySrc)}`
          : '';
      lines.push(`  - ${name}${where}`);
    }
  }

  if (typeof picked.propsSnapshot === 'string' && picked.propsSnapshot.length > 0) {
    lines.push('Props:');
    lines.push('```json');
    lines.push(picked.propsSnapshot);
    lines.push('```');
  }
}

interface SourceSlice {
  fileName: string;
  targetLine: number;
  body: string;
}

interface CollectSourceSlicesOptions {
  files: FileTools | undefined;
  contextLines: number;
  maxSlices: number;
}

async function collectSourceSlices(
  picked: Record<string, unknown>,
  options: CollectSourceSlicesOptions,
): Promise<SourceSlice[]> {
  if (!options.files) return [];

  const requested: { fileName: string; lineNumber: number }[] = [];
  const chain = Array.isArray(picked.componentChain) ? picked.componentChain : [];
  for (const entry of chain) {
    if (!isPlainObject(entry)) continue;
    const src = isPlainObject(entry.source) ? entry.source : undefined;
    if (!src) continue;
    const fileName = typeof src.fileName === 'string' ? src.fileName : undefined;
    const lineNumber = typeof src.lineNumber === 'number' ? src.lineNumber : undefined;
    if (!fileName || !lineNumber || !Number.isFinite(lineNumber)) continue;
    requested.push({ fileName, lineNumber });
  }
  // Fallback: when the chain is empty but the picked source is set
  // (unusual — only happens for a host fiber whose direct parent wasn't
  // walked). Still worth a slice.
  if (requested.length === 0) {
    const src = isPlainObject(picked.source) ? picked.source : undefined;
    if (src) {
      const fileName = typeof src.fileName === 'string' ? src.fileName : undefined;
      const lineNumber = typeof src.lineNumber === 'number' ? src.lineNumber : undefined;
      if (fileName && lineNumber && Number.isFinite(lineNumber)) {
        requested.push({ fileName, lineNumber });
      }
    }
  }

  const slices: SourceSlice[] = [];
  const seenFiles = new Set<string>();
  for (const req of requested) {
    if (slices.length >= options.maxSlices) break;
    if (seenFiles.has(req.fileName)) continue;
    seenFiles.add(req.fileName);
    let contents: string;
    try {
      contents = await options.files.readFile(req.fileName);
    } catch {
      // Silently skip — out-of-workspace or missing files just leave the
      // path-only listing visible in the picked-element block.
      continue;
    }
    const body = renderSlice(contents, req.lineNumber, options.contextLines);
    if (!body) continue;
    slices.push({ fileName: req.fileName, targetLine: req.lineNumber, body });
  }
  return slices;
}

function renderSlice(contents: string, targetLine: number, contextLines: number): string {
  const allLines = contents.split('\n');
  const totalLines = allLines.length;
  if (totalLines === 0) return '';
  const target = Math.max(1, Math.min(targetLine, totalLines));
  const start = Math.max(1, target - contextLines);
  const end = Math.min(totalLines, target + contextLines);
  const gutterWidth = String(end).length;
  const out: string[] = ['```'];
  for (let n = start; n <= end; n += 1) {
    const marker = n === target ? '>' : ' ';
    const lineNo = String(n).padStart(gutterWidth, ' ');
    const text = allLines[n - 1] ?? '';
    out.push(`${marker} ${lineNo} | ${text}`);
  }
  out.push('```');
  return out.join('\n');
}

function formatSourceLocation(src: Record<string, unknown>): string {
  const fileName = typeof src.fileName === 'string' ? src.fileName : '';
  const line = typeof src.lineNumber === 'number' ? `:${String(src.lineNumber)}` : '';
  const col = typeof src.columnNumber === 'number' ? `:${String(src.columnNumber)}` : '';
  return `${fileName}${line}${col}`;
}

function pickPicked(
  pageContext: Record<string, unknown> | undefined,
  ctx: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (pageContext && isPlainObject(pageContext.picked)) return pageContext.picked;
  if (isPlainObject(ctx.picked)) return ctx.picked;
  return undefined;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
