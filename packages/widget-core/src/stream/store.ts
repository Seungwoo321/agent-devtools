/**
 * Conversation store for the widget. Folds incoming `StreamEvent`s into a
 * flat `MessageItem[]` and notifies subscribers (the renderer) on change.
 *
 * Identity / threading rules:
 *   - User messages are appended directly via `appendUserMessage`.
 *   - Assistant text deltas append onto an existing `assistant-text` item
 *     keyed by `blockId`. The first delta with a new `blockId` creates the
 *     item with `streaming: true`; `text-stop` flips it to `streaming: false`.
 *   - tool_use deltas append into `inputPreview`, allowing partial-JSON
 *     visibility while the model streams the input.
 *   - tool_result events look up the matching `tool-use` by `blockId` to
 *     pull `toolUseId`; if no match (out-of-order delivery), the result is
 *     still appended so the UI doesn't silently drop it.
 */
import type { PickedEvidence } from '../context/types.js';
import { loadMessages, saveMessages, type ConversationStorageOptions } from './storage.js';
import type { MessageItem, StreamEvent, ToolUseItem } from './types.js';

export interface MessageStore {
  getItems(): readonly MessageItem[];
  subscribe(listener: () => void): () => void;
  appendUserMessage(text: string, pickedEvidence?: PickedEvidence): string;
  applyEvent(event: StreamEvent): void;
  clear(): void;
}

export interface CreateStoreOptions extends ConversationStorageOptions {
  /** Override the id generator (tests pass a deterministic counter). */
  readonly generateId?: () => string;
  /**
   * Persist mutations through the configured storage. Defaults to `true` when
   * a storage backend is available. Tests that exercise pure folding without
   * touching `sessionStorage` set this to `false` (or pass `storage: null`).
   */
  readonly persist?: boolean;
}

export function createMessageStore(options: CreateStoreOptions = {}): MessageStore {
  const persist = options.persist ?? true;
  const storageOptions: ConversationStorageOptions = {
    ...(options.storage !== undefined && { storage: options.storage }),
    ...(options.key !== undefined && { key: options.key }),
  };
  let items: MessageItem[] = persist ? loadMessages(storageOptions) : [];
  const listeners = new Set<() => void>();
  const blockIndex = new Map<string, number>();
  const generateId = options.generateId ?? defaultIdGenerator();

  function flush(): void {
    if (!persist) return;
    saveMessages(items, storageOptions);
  }

  function notify(): void {
    flush();
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* isolate */
      }
    }
  }

  function replaceAt(index: number, next: MessageItem): void {
    items = [...items.slice(0, index), next, ...items.slice(index + 1)];
  }

  function pushItem(item: MessageItem): number {
    items = [...items, item];
    return items.length - 1;
  }

  function findToolUseByBlockId(blockId: string): ToolUseItem | null {
    const idx = blockIndex.get(blockId);
    if (idx === undefined) return null;
    const it = items[idx];
    return it && it.kind === 'tool-use' ? it : null;
  }

  // Pending placeholders are only ever pushed at the end of `items` (right
  // after the latest user message) and only ever dropped from the end (on
  // the first concrete assistant content event or before the next user
  // turn). Because indexed items — assistant-text and tool-use, tracked in
  // `blockIndex` — always sit before any in-flight pending placeholder,
  // removing pending entries never shifts an indexed item's position.
  function clearPending(): boolean {
    let changed = false;
    const next = items.filter((item) => {
      if (item.kind === 'assistant-pending') {
        changed = true;
        return false;
      }
      return true;
    });
    if (changed) items = next;
    return changed;
  }

  function applyEvent(event: StreamEvent): void {
    switch (event.type) {
      case 'message-start':
        // Pure marker for now; the store doesn't need to allocate.
        return;
      case 'text-delta': {
        const existingIdx = blockIndex.get(event.blockId);
        if (existingIdx === undefined) {
          clearPending();
          const id = generateId();
          const idx = pushItem({
            kind: 'assistant-text',
            id,
            text: event.text,
            streaming: true,
          });
          blockIndex.set(event.blockId, idx);
        } else {
          const prev = items[existingIdx];
          if (!prev || prev.kind !== 'assistant-text') return;
          replaceAt(existingIdx, { ...prev, text: prev.text + event.text });
        }
        notify();
        return;
      }
      case 'text-stop': {
        const idx = blockIndex.get(event.blockId);
        if (idx === undefined) return;
        const prev = items[idx];
        if (!prev || prev.kind !== 'assistant-text') return;
        replaceAt(idx, { ...prev, streaming: false });
        notify();
        return;
      }
      case 'tool-use-start': {
        if (blockIndex.has(event.blockId)) return;
        clearPending();
        const id = generateId();
        const idx = pushItem({
          kind: 'tool-use',
          id,
          name: event.name,
          inputPreview: '',
          streaming: true,
        });
        blockIndex.set(event.blockId, idx);
        notify();
        return;
      }
      case 'tool-use-delta': {
        const idx = blockIndex.get(event.blockId);
        if (idx === undefined) return;
        const prev = items[idx];
        if (!prev || prev.kind !== 'tool-use') return;
        replaceAt(idx, { ...prev, inputPreview: prev.inputPreview + event.partialInput });
        notify();
        return;
      }
      case 'tool-use-stop': {
        const idx = blockIndex.get(event.blockId);
        if (idx === undefined) return;
        const prev = items[idx];
        if (!prev || prev.kind !== 'tool-use') return;
        replaceAt(idx, { ...prev, streaming: false });
        notify();
        return;
      }
      case 'tool-result': {
        const linked = findToolUseByBlockId(event.toolUseId);
        const id = generateId();
        pushItem({
          kind: 'tool-result',
          id,
          toolUseId: linked?.id ?? event.toolUseId,
          content: event.content,
          isError: event.isError === true,
        });
        notify();
        return;
      }
      case 'error': {
        clearPending();
        const id = generateId();
        pushItem({ kind: 'error', id, message: event.message });
        notify();
        return;
      }
      case 'done': {
        // Mark all streaming items finalized so the renderer can drop the
        // cursor / pulsing indicator, and drop any in-flight pending
        // placeholder (degenerate case: model returned no content blocks).
        let changed = clearPending();
        items = items.map((item) => {
          if (item.kind === 'assistant-text' && item.streaming) {
            changed = true;
            return { ...item, streaming: false };
          }
          if (item.kind === 'tool-use' && item.streaming) {
            changed = true;
            return { ...item, streaming: false };
          }
          return item;
        });
        if (changed) notify();
        return;
      }
    }
  }

  return {
    getItems(): readonly MessageItem[] {
      return items;
    },
    subscribe(listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    appendUserMessage(text, pickedEvidence): string {
      // Drop any in-flight pending placeholder from an aborted previous
      // turn so the new pending marker is always the only one at the end.
      clearPending();
      const id = generateId();
      pushItem({
        kind: 'user',
        id,
        text,
        ...(pickedEvidence !== undefined && { pickedEvidence }),
      });
      pushItem({
        kind: 'assistant-pending',
        id: generateId(),
      });
      notify();
      return id;
    },
    applyEvent,
    clear(): void {
      if (items.length === 0 && blockIndex.size === 0) return;
      items = [];
      blockIndex.clear();
      notify();
    },
  };
}

function defaultIdGenerator(): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `m-${Date.now().toString(36)}-${counter}`;
  };
}
