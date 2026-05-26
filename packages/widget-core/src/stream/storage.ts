/**
 * Conversation persistence. Mirrors `settings/storage.ts` shape so the same
 * test harness (storage stub injection, throwing-storage fallback) carries
 * over. Defaults to `sessionStorage` rather than `localStorage` because the
 * pairing token rotates on every CLI restart — a stale `localStorage`
 * conversation would point at a server that can no longer authenticate.
 * Tab lifetime is the correct scope.
 *
 * Failures are silent by design — a dropped read falls back to an empty
 * conversation; a dropped write loses the most recent turn. The widget is
 * dev-only and the user can re-send a prompt.
 */
import type { PickedEvidence } from '../context/types.js';
import type { MessageItem } from './types.js';

export const DEFAULT_CONVERSATION_STORAGE_KEY = 'agent-devtools:conversation';

export interface ConversationStorageOptions {
  /** Storage backend. Defaults to `globalThis.sessionStorage`. */
  readonly storage?: Storage | null;
  /** Key used to read/write the conversation payload. */
  readonly key?: string;
}

function resolveStorage(options: ConversationStorageOptions): Storage | null {
  if (options.storage !== undefined) return options.storage;
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function loadMessages(options: ConversationStorageOptions = {}): MessageItem[] {
  const storage = resolveStorage(options);
  if (!storage) return [];
  const key = options.key ?? DEFAULT_CONVERSATION_STORAGE_KEY;
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return [];
  }
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: MessageItem[] = [];
    for (const entry of parsed) {
      const item = sanitizeItem(entry);
      if (item !== null) out.push(item);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveMessages(
  items: readonly MessageItem[],
  options: ConversationStorageOptions = {},
): boolean {
  const storage = resolveStorage(options);
  if (!storage) return false;
  const key = options.key ?? DEFAULT_CONVERSATION_STORAGE_KEY;
  try {
    // Drop transient `streaming` markers — a re-hydrated conversation never
    // resumes mid-stream; any half-streamed assistant text should look final
    // after a reload (cursor gone, item present). Pending placeholders are
    // also stripped because there is no in-flight turn to wait on after a
    // reload — the conventional three dot indicator would lie about state.
    const serializable: unknown[] = [];
    for (const item of items) {
      if (item.kind === 'assistant-pending') continue;
      if (item.kind === 'assistant-text' || item.kind === 'tool-use') {
        serializable.push({ ...item, streaming: false });
        continue;
      }
      serializable.push(item);
    }
    storage.setItem(key, JSON.stringify(serializable));
    return true;
  } catch {
    return false;
  }
}

export function clearMessages(options: ConversationStorageOptions = {}): void {
  const storage = resolveStorage(options);
  if (!storage) return;
  const key = options.key ?? DEFAULT_CONVERSATION_STORAGE_KEY;
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function sanitizeItem(value: unknown): MessageItem | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!isNonEmptyString(v.id)) return null;
  switch (v.kind) {
    case 'user': {
      if (typeof v.text !== 'string') return null;
      const evidence = sanitizePickedEvidence(v.pickedEvidence);
      return {
        kind: 'user',
        id: v.id,
        text: v.text,
        ...(evidence !== null && { pickedEvidence: evidence }),
      };
    }
    case 'assistant-text':
      if (typeof v.text !== 'string') return null;
      return {
        kind: 'assistant-text',
        id: v.id,
        text: v.text,
        streaming: false,
      };
    case 'tool-use':
      if (typeof v.name !== 'string' || typeof v.inputPreview !== 'string') return null;
      return {
        kind: 'tool-use',
        id: v.id,
        name: v.name,
        inputPreview: v.inputPreview,
        streaming: false,
      };
    case 'tool-result':
      if (typeof v.toolUseId !== 'string' || typeof v.content !== 'string') return null;
      return {
        kind: 'tool-result',
        id: v.id,
        toolUseId: v.toolUseId,
        content: v.content,
        isError: v.isError === true,
      };
    case 'error':
      if (typeof v.message !== 'string') return null;
      return { kind: 'error', id: v.id, message: v.message };
    default:
      return null;
  }
}

function sanitizePickedEvidence(value: unknown): PickedEvidence | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.componentName !== 'string' || typeof v.tagName !== 'string') return null;
  if (typeof v.selector !== 'string' || typeof v.outerHTML !== 'string') return null;
  const attributes =
    typeof v.attributes === 'object' && v.attributes !== null
      ? Object.fromEntries(
          Object.entries(v.attributes as Record<string, unknown>).filter(
            ([, val]) => typeof val === 'string',
          ) as Array<[string, string]>,
        )
      : {};
  const chain = Array.isArray(v.componentChain)
    ? v.componentChain
        .map((entry) => sanitizeChainEntry(entry))
        .filter((entry): entry is PickedEvidence['componentChain'][number] => entry !== null)
    : [];
  const result: Record<string, unknown> = {
    componentName: v.componentName,
    tagName: v.tagName,
    selector: v.selector,
    outerHTML: v.outerHTML,
    attributes,
    componentChain: chain,
  };
  const source = sanitizeSourceLocation(v.source);
  if (source) result.source = source;
  const boundingRect = sanitizeBoundingRect(v.boundingRect);
  if (boundingRect) result.boundingRect = boundingRect;
  if (typeof v.text === 'string') result.text = v.text;
  if (typeof v.id === 'string') result.id = v.id;
  if (typeof v.className === 'string') result.className = v.className;
  if (typeof v.propsSnapshot === 'string') result.propsSnapshot = v.propsSnapshot;
  if (Array.isArray(v.relatedImports)) {
    const imports = v.relatedImports.filter((entry): entry is string => typeof entry === 'string');
    if (imports.length > 0) result.relatedImports = imports;
  }
  const slice = sanitizeSourceSlice(v.sourceSlice);
  if (slice) result.sourceSlice = slice;
  return result as unknown as PickedEvidence;
}

function sanitizeChainEntry(value: unknown): PickedEvidence['componentChain'][number] | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.componentName !== 'string') return null;
  const source = sanitizeSourceLocation(v.source);
  return source ? { componentName: v.componentName, source } : { componentName: v.componentName };
}

function sanitizeSourceLocation(value: unknown): NonNullable<PickedEvidence['source']> | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.fileName !== 'string' || typeof v.lineNumber !== 'number') return null;
  return typeof v.columnNumber === 'number'
    ? { fileName: v.fileName, lineNumber: v.lineNumber, columnNumber: v.columnNumber }
    : { fileName: v.fileName, lineNumber: v.lineNumber };
}

function sanitizeBoundingRect(value: unknown): NonNullable<PickedEvidence['boundingRect']> | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const keys = ['x', 'y', 'width', 'height'] as const;
  for (const k of keys) if (typeof v[k] !== 'number') return null;
  return {
    x: v.x as number,
    y: v.y as number,
    width: v.width as number,
    height: v.height as number,
  };
}

function sanitizeSourceSlice(value: unknown): NonNullable<PickedEvidence['sourceSlice']> | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.code !== 'string') return null;
  if (typeof v.startLine !== 'number' || typeof v.endLine !== 'number') return null;
  return { code: v.code, startLine: v.startLine, endLine: v.endLine };
}
