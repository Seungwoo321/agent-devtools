/**
 * Renderer for the conversation list. Subscribes to a `MessageStore` and
 * reconciles a flat DOM list by `MessageItem.id`. We don't pull in React
 * here — the widget's whole point is to be page-agnostic, and a tiny
 * imperative renderer keeps the bundle small and avoids fighting host-app
 * React versions inside a shadow root.
 *
 * Reconciliation strategy: minimal. We re-render each item every change
 * (cheap because deltas only mutate one item in the list and items are
 * structurally shallow). For very long conversations a per-item dirty
 * check could be added later, but the MVP defaults to correctness over
 * cleverness.
 */
import type { MessageStore } from './store.js';
import type { MessageItem, ToolResultItem } from './types.js';
import { renderAssistantMarkdown } from './markdown.js';

const ROOT_ATTR = 'data-agent-devtools-stream';
const ITEM_ATTR = 'data-agent-devtools-stream-item';

export interface CreateStreamRendererOptions {
  /** Container to mount the scrolling list into. */
  readonly container: HTMLElement;
  /** Message store to subscribe to. */
  readonly store: MessageStore;
  /** Document override. Defaults to container.ownerDocument. */
  readonly document?: Document;
  /** Auto-scroll to bottom on new items. Defaults to true. */
  readonly autoScroll?: boolean;
}

export interface StreamRendererHandle {
  readonly element: HTMLElement;
  /** Force a re-render. Rarely needed — the store-subscribe wiring is enough. */
  refresh(): void;
  /**
   * Snap the list to the most recent message. Used by the orchestrator
   * when re-opening the composer panel — while the panel is `display:
   * none` the scroll position is not retained reliably, so we re-anchor
   * after it becomes visible so the user lands on the latest turn.
   */
  scrollToBottom(): void;
  destroy(): void;
}

export function createStreamRenderer(options: CreateStreamRendererOptions): StreamRendererHandle {
  const container = options.container;
  const doc = options.document ?? container.ownerDocument;
  if (!doc) throw new Error('createStreamRenderer: container must be in a document');
  const autoScroll = options.autoScroll ?? true;

  const root = doc.createElement('div');
  root.setAttribute(ROOT_ATTR, '');
  applyRootStyles(root);
  container.appendChild(root);

  // Map id -> element. Each render diff updates the map.
  let mounted = new Map<string, HTMLElement>();
  let destroyed = false;

  function render(): void {
    if (destroyed) return;
    const items = options.store.getItems();
    const seen = new Set<string>();
    // Pre-index tool-results by their tool-use id so we can absorb the
    // result into the use's <details> instead of rendering it as a
    // separate top-level item. A standard agent chat UI groups
    // input + output for one tool invocation into a single collapsible
    // block — store keeps them as peer items (flat shape is easier to
    // stream), and the renderer does the presentation-layer pairing.
    const resultByToolUseId = new Map<string, ToolResultItem>();
    for (const item of items) {
      if (item.kind === 'tool-result') resultByToolUseId.set(item.toolUseId, item);
    }
    let cursor: ChildNode | null = root.firstChild;

    for (const item of items) {
      // tool-result is rendered INSIDE its tool-use's <details>; never as a
      // top-level item. Skip without mounting / tracking.
      if (item.kind === 'tool-result') continue;
      seen.add(item.id);
      const linkedResult =
        item.kind === 'tool-use' ? (resultByToolUseId.get(item.id) ?? null) : null;
      const existing = mounted.get(item.id);
      const node = existing ?? createNode(doc!, item, linkedResult);
      if (!existing) mounted.set(item.id, node);
      else updateNode(node, item, linkedResult);

      // Place node at the cursor position.
      if (cursor !== node) {
        root.insertBefore(node, cursor);
      }
      cursor = node.nextSibling;
    }

    // Remove leftover nodes whose ids no longer exist (after a `clear`).
    while (cursor) {
      const next = cursor.nextSibling;
      const el = cursor as HTMLElement;
      const id = el.getAttribute?.(ITEM_ATTR);
      if (id) mounted.delete(id);
      root.removeChild(cursor);
      cursor = next;
    }

    // Prune stale ids from the map (defensive — should already be empty).
    for (const id of [...mounted.keys()]) {
      if (!seen.has(id)) mounted.delete(id);
    }

    if (autoScroll) {
      root.scrollTop = root.scrollHeight;
    }
  }

  const unsubscribe = options.store.subscribe(render);
  render();

  return {
    element: root,
    refresh: render,
    scrollToBottom(): void {
      if (destroyed) return;
      root.scrollTop = root.scrollHeight;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      root.remove();
      mounted = new Map();
    },
  };
}

function createNode(
  doc: Document,
  item: MessageItem,
  linkedResult: ToolResultItem | null,
): HTMLElement {
  const el = doc.createElement('div');
  el.setAttribute(ITEM_ATTR, item.id);
  el.setAttribute('data-kind', item.kind);
  applyItemStyles(el, item);
  el.appendChild(buildItemContent(doc, item, linkedResult));
  return el;
}

function updateNode(el: HTMLElement, item: MessageItem, linkedResult: ToolResultItem | null): void {
  el.setAttribute('data-kind', item.kind);
  applyItemStyles(el, item);
  el.replaceChildren(buildItemContent(el.ownerDocument, item, linkedResult));
}

function buildItemContent(
  doc: Document,
  item: MessageItem,
  linkedResult: ToolResultItem | null,
): DocumentFragment {
  const frag = doc.createDocumentFragment();
  switch (item.kind) {
    case 'user': {
      if (item.pickedSummary) {
        const chip = doc.createElement('span');
        chip.textContent = item.pickedSummary;
        applyUserChipStyles(chip);
        frag.appendChild(chip);
      }
      const body = doc.createElement('div');
      body.textContent = item.text;
      applyUserBodyStyles(body);
      frag.appendChild(body);
      break;
    }
    case 'assistant-text': {
      const body = doc.createElement('div');
      applyAssistantBodyStyles(body);
      renderAssistantMarkdown(body, item.text);
      if (item.streaming) {
        const cursor = doc.createElement('span');
        cursor.textContent = '▍';
        applyAssistantCursorStyles(cursor);
        body.appendChild(cursor);
      }
      frag.appendChild(body);
      break;
    }
    case 'tool-use': {
      const details = doc.createElement('details');
      applyToolDetailsStyles(details);
      const summary = doc.createElement('summary');
      const label = linkedResult?.isError ? `${item.name} · error` : item.name;
      summary.textContent = item.streaming ? `▸ ${label}…` : `▸ ${label}`;
      applyToolSummaryStyles(summary, linkedResult?.isError === true);
      details.appendChild(summary);
      if (item.inputPreview) {
        const inputPre = doc.createElement('pre');
        inputPre.setAttribute('data-tool-input', '');
        inputPre.textContent = item.inputPreview;
        applyToolPreStyles(inputPre);
        details.appendChild(inputPre);
      }
      if (linkedResult) {
        const divider = doc.createElement('div');
        divider.setAttribute('data-tool-result-divider', '');
        divider.textContent = linkedResult.isError ? '↳ error' : '↳ result';
        applyToolDividerStyles(divider, linkedResult.isError);
        details.appendChild(divider);
        const resultPre = doc.createElement('pre');
        resultPre.setAttribute('data-tool-result', '');
        resultPre.textContent = linkedResult.content;
        applyToolPreStyles(resultPre);
        details.appendChild(resultPre);
      }
      frag.appendChild(details);
      break;
    }
    case 'tool-result':
      // Absorbed into the matching tool-use block; never rendered top-level.
      break;
    case 'error': {
      const body = doc.createElement('div');
      body.textContent = item.message;
      applyErrorStyles(body);
      frag.appendChild(body);
      break;
    }
  }
  return frag;
}

function applyRootStyles(el: HTMLElement): void {
  const s = el.style;
  s.display = 'flex';
  s.flexDirection = 'column';
  s.gap = '8px';
  s.padding = '12px';
  s.overflowY = 'auto';
  // The composer panel now owns its own height (drag-resizable + persisted).
  // The stream area is the flex-grow child so the user's panel size
  // controls the visible message area; no hard cap here.
  s.flex = '1 1 auto';
  s.minHeight = '0';
  s.fontSize = '13px';
  s.lineHeight = '1.45';
}

function applyItemStyles(el: HTMLElement, item: MessageItem): void {
  const s = el.style;
  s.display = 'flex';
  s.flexDirection = 'column';
  s.gap = '4px';
  s.alignItems = item.kind === 'user' ? 'flex-end' : 'flex-start';
}

function applyUserChipStyles(el: HTMLElement): void {
  const s = el.style;
  s.fontSize = '11px';
  s.padding = '2px 8px';
  s.borderRadius = '999px';
  s.background = 'rgba(0, 0, 0, 0.06)';
  s.color = '#1a1a1a';
}

function applyUserBodyStyles(el: HTMLElement): void {
  const s = el.style;
  s.padding = '8px 12px';
  s.borderRadius = '14px 14px 4px 14px';
  s.background = '#1a1a1a';
  s.color = '#ffffff';
  s.maxWidth = '85%';
  s.whiteSpace = 'pre-wrap';
  s.wordBreak = 'break-word';
}

function applyAssistantBodyStyles(el: HTMLElement): void {
  const s = el.style;
  s.padding = '8px 12px';
  s.borderRadius = '14px 14px 14px 4px';
  s.background = 'rgba(0, 0, 0, 0.04)';
  s.color = '#1a1a1a';
  s.maxWidth = '85%';
  s.whiteSpace = 'pre-wrap';
  s.wordBreak = 'break-word';
}

function applyAssistantCursorStyles(el: HTMLElement): void {
  const s = el.style;
  s.display = 'inline-block';
  s.marginLeft = '2px';
  s.opacity = '0.6';
}

function applyToolDetailsStyles(el: HTMLElement): void {
  const s = el.style;
  s.width = '100%';
  s.maxWidth = '100%';
  s.display = 'flex';
  s.flexDirection = 'column';
  s.gap = '6px';
}

function applyToolSummaryStyles(el: HTMLElement, isError = false): void {
  const s = el.style;
  s.fontSize = '12px';
  s.fontFamily =
    'ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, Consolas, "Liberation Mono", monospace';
  s.color = isError ? '#b00020' : '#444';
  s.cursor = 'pointer';
  s.userSelect = 'none';
  s.listStyle = 'none';
}

function applyToolDividerStyles(el: HTMLElement, isError = false): void {
  const s = el.style;
  s.fontSize = '11px';
  s.fontFamily =
    'ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, Consolas, "Liberation Mono", monospace';
  s.color = isError ? '#b00020' : '#666';
  s.paddingTop = '4px';
  s.borderTop = '1px dashed rgba(0, 0, 0, 0.08)';
}

function applyToolPreStyles(el: HTMLElement): void {
  const s = el.style;
  s.margin = '0';
  s.padding = '8px 10px';
  s.background = 'rgba(0, 0, 0, 0.04)';
  s.borderRadius = '8px';
  s.fontFamily =
    'ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, Consolas, "Liberation Mono", monospace';
  s.fontSize = '11px';
  s.maxWidth = '100%';
  s.overflowX = 'auto';
  s.whiteSpace = 'pre-wrap';
  s.wordBreak = 'break-word';
}

function applyErrorStyles(el: HTMLElement): void {
  const s = el.style;
  s.padding = '8px 12px';
  s.borderRadius = '8px';
  s.background = 'rgba(176, 0, 32, 0.08)';
  s.color = '#b00020';
  s.fontSize = '12px';
}
