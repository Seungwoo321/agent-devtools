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
    // after a reload (cursor gone, item present).
    const serializable = items.map((item) => {
      if (item.kind === 'assistant-text' || item.kind === 'tool-use') {
        return { ...item, streaming: false };
      }
      return item;
    });
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
    case 'user':
      if (typeof v.text !== 'string') return null;
      return {
        kind: 'user',
        id: v.id,
        text: v.text,
        ...(typeof v.pickedSummary === 'string' && { pickedSummary: v.pickedSummary }),
      };
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
