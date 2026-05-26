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
import type { PickedEvidence } from '../context/types.js';
import type { MessageStore } from './store.js';
import type { MessageItem, ToolResultItem } from './types.js';
import { renderAssistantMarkdown } from './markdown.js';

const ROOT_ATTR = 'data-agent-devtools-stream';
const ITEM_ATTR = 'data-agent-devtools-stream-item';

/**
 * Frame scheduler used by the smooth-reveal loop. Returns a cancel function
 * so the renderer can tear pending frames down on destroy without leaking.
 * Defaults to `requestAnimationFrame` in environments that have it.
 *
 * Pass a manual stepper in tests; pass `null` to disable smooth reveal so
 * the rendered text always equals the store text (useful when respecting
 * `prefers-reduced-motion` or when running headless).
 */
export type FrameScheduler = (cb: () => void) => () => void;

export interface CreateStreamRendererOptions {
  /** Container to mount the scrolling list into. */
  readonly container: HTMLElement;
  /** Message store to subscribe to. */
  readonly store: MessageStore;
  /** Document override. Defaults to container.ownerDocument. */
  readonly document?: Document;
  /** Auto-scroll to bottom on new items. Defaults to true. */
  readonly autoScroll?: boolean;
  /**
   * Frame scheduler for the smooth assistant text reveal loop. Defaults
   * to `requestAnimationFrame` when available. Pass `null` to disable
   * smoothing (rendered text equals store text on every change).
   */
  readonly frameScheduler?: FrameScheduler | null;
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
  // Smooth reveal is opt-in. Production (mount.ts) wires up a real
  // `requestAnimationFrame` scheduler so streamed text grows at a steady
  // cadence; tests and SSR callers leave `frameScheduler` undefined so
  // the rendered text always equals the store text on every change.
  const scheduleFrame: FrameScheduler | null = options.frameScheduler ?? null;

  // The @keyframes block for the pending typing indicator must live in a real
  // stylesheet (inline `style.animation` can reference the name but cannot
  // define the keyframes). Inject it as a sibling of `root` so the render
  // loop's child-pruning logic, which removes every leftover child of `root`
  // each tick, never touches it.
  const styleEl = doc.createElement('style');
  styleEl.setAttribute('data-agent-devtools-stream-style', '');
  styleEl.textContent =
    '@keyframes agent-devtools-pending-dot { 0%, 80%, 100% { opacity: 0.25; transform: scale(0.85); } 40% { opacity: 1; transform: scale(1); } }';
  container.appendChild(styleEl);

  const root = doc.createElement('div');
  root.setAttribute(ROOT_ATTR, '');
  applyRootStyles(root);
  container.appendChild(root);

  // Map id -> element. Each render diff updates the map.
  let mounted = new Map<string, HTMLElement>();
  let destroyed = false;

  // Smooth-reveal state: for each assistant-text item, how many characters
  // we have already painted. Lags behind `item.text.length` while streaming
  // so the rendered bubble grows at a steady cadence regardless of how
  // lumpy the incoming deltas are. The scheduled callback below drains the
  // backlog one frame at a time.
  const revealed = new Map<string, number>();
  let cancelFrame: (() => void) | null = null;

  function snapshotReveal(items: readonly MessageItem[]): boolean {
    // Smoothing disabled: rendered text always equals store text. Keep the
    // map empty so `readDisplayText` falls back to `item.text`.
    if (scheduleFrame === null) {
      if (revealed.size > 0) revealed.clear();
      return false;
    }
    // Initialise newly seen assistant-text entries, drop entries for items
    // that no longer exist (clear/unwind), and surface whether any
    // streaming item still has characters left to reveal so the caller
    // knows whether to schedule another frame.
    let hasPending = false;
    const seen = new Set<string>();
    for (const item of items) {
      if (item.kind !== 'assistant-text') continue;
      seen.add(item.id);
      let current = revealed.get(item.id);
      if (current === undefined) {
        // First time we see this bubble. If it is no longer streaming
        // (e.g. re-hydrated from storage, or a `done` event flipped the
        // flag before the renderer ever rendered the partial state),
        // snap straight to the end so we never replay finished history.
        current = item.streaming ? 0 : item.text.length;
        revealed.set(item.id, current);
      }
      if (!item.streaming) {
        // text-stop / done has already finalised this bubble. Per the
        // success criteria, when the item flips to streaming false the
        // rendered text must immediately catch up to the full received
        // text — no trailing cadence past stop.
        if (current < item.text.length) {
          revealed.set(item.id, item.text.length);
        }
        continue;
      }
      if (current < item.text.length) hasPending = true;
    }
    for (const id of [...revealed.keys()]) {
      if (!seen.has(id)) revealed.delete(id);
    }
    return hasPending;
  }

  function advanceReveal(items: readonly MessageItem[]): { advanced: boolean; pending: boolean } {
    let advanced = false;
    let pending = false;
    for (const item of items) {
      if (item.kind !== 'assistant-text' || !item.streaming) continue;
      const current = revealed.get(item.id) ?? item.text.length;
      if (current >= item.text.length) continue;
      const backlog = item.text.length - current;
      // Aim to drain the backlog over roughly 16 frames (~280ms at 60fps).
      // Floor 1 character so even a single-character drip keeps moving;
      // cap at the remaining backlog so we never overshoot.
      const charsThisFrame = Math.max(1, Math.min(backlog, Math.ceil(backlog / 16)));
      const next = current + charsThisFrame;
      revealed.set(item.id, next);
      advanced = true;
      if (next < item.text.length) pending = true;
    }
    return { advanced, pending };
  }

  function scheduleNextFrame(): void {
    if (scheduleFrame === null) return;
    if (cancelFrame !== null) return;
    cancelFrame = scheduleFrame(() => {
      cancelFrame = null;
      if (destroyed) return;
      const items = options.store.getItems();
      const { advanced, pending } = advanceReveal(items);
      if (advanced) renderDom(items);
      if (pending) scheduleNextFrame();
    });
  }

  function renderDom(items: readonly MessageItem[]): void {
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
      const displayText = item.kind === 'assistant-text' ? readDisplayText(item) : null;
      const existing = mounted.get(item.id);
      const node = existing ?? createNode(doc!, item, linkedResult, displayText);
      if (!existing) mounted.set(item.id, node);
      else updateNode(node, item, linkedResult, displayText);

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

  function readDisplayText(item: { id: string; text: string; streaming: boolean }): string {
    const upto = revealed.get(item.id);
    if (upto === undefined) return item.text;
    return item.text.slice(0, upto);
  }

  function render(): void {
    if (destroyed) return;
    const items = options.store.getItems();
    const hasPending = snapshotReveal(items);
    renderDom(items);
    if (hasPending) scheduleNextFrame();
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
      if (cancelFrame) {
        cancelFrame();
        cancelFrame = null;
      }
      revealed.clear();
      root.remove();
      styleEl.remove();
      mounted = new Map();
    },
  };
}

interface FrameHost {
  requestAnimationFrame(cb: FrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
}

/**
 * Frame scheduler bound to the host page's `requestAnimationFrame`. Returns
 * `null` if the environment exposes no rAF (e.g. SSR), in which case the
 * caller should leave `frameScheduler` undefined to fall back to instant
 * rendering. Lives next to `createStreamRenderer` so production mount code
 * can wire it up without inlining DOM globals.
 */
export function createAnimationFrameScheduler(host?: FrameHost): FrameScheduler | null {
  const target = host ?? (resolveDefaultFrameHost() as FrameHost | null);
  if (!target) return null;
  return (cb) => {
    const handle = target.requestAnimationFrame(() => cb());
    return () => target.cancelAnimationFrame(handle);
  };
}

function resolveDefaultFrameHost(): FrameHost | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as Partial<FrameHost>;
  if (typeof g.requestAnimationFrame !== 'function') return null;
  if (typeof g.cancelAnimationFrame !== 'function') return null;
  return g as FrameHost;
}

function createNode(
  doc: Document,
  item: MessageItem,
  linkedResult: ToolResultItem | null,
  displayText: string | null,
): HTMLElement {
  const el = doc.createElement('div');
  el.setAttribute(ITEM_ATTR, item.id);
  el.setAttribute('data-kind', item.kind);
  applyItemStyles(el, item);
  el.appendChild(buildItemContent(doc, item, linkedResult, displayText));
  return el;
}

function updateNode(
  el: HTMLElement,
  item: MessageItem,
  linkedResult: ToolResultItem | null,
  displayText: string | null,
): void {
  el.setAttribute('data-kind', item.kind);
  applyItemStyles(el, item);
  el.replaceChildren(buildItemContent(el.ownerDocument, item, linkedResult, displayText));
}

function buildItemContent(
  doc: Document,
  item: MessageItem,
  linkedResult: ToolResultItem | null,
  displayText: string | null,
): DocumentFragment {
  const frag = doc.createDocumentFragment();
  switch (item.kind) {
    case 'user': {
      if (item.pickedEvidence) {
        frag.appendChild(buildPickedEvidenceChip(doc, item.pickedEvidence));
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
      // displayText is the cadence-paced slice of the streaming text; on
      // text-stop / done it equals the full text. Fall back to the raw
      // text when the renderer is running without a frame scheduler.
      const visible = displayText ?? item.text;
      renderAssistantMarkdown(body, visible);
      // Keep the blinking cursor on while either the model is still
      // streaming chunks OR the rendered slice is still chasing the
      // received text. Either condition implies "more text is on the way".
      const stillRevealing = visible.length < item.text.length;
      if (item.streaming || stillRevealing) {
        const cursor = doc.createElement('span');
        cursor.textContent = '▍';
        applyAssistantCursorStyles(cursor);
        body.appendChild(cursor);
      }
      frag.appendChild(body);
      break;
    }
    case 'assistant-pending': {
      const indicator = doc.createElement('div');
      indicator.setAttribute('data-agent-devtools-pending', '');
      applyAssistantPendingStyles(indicator);
      const delays = [0, 160, 320];
      for (const delay of delays) {
        const dot = doc.createElement('span');
        dot.setAttribute('data-agent-devtools-pending-dot', '');
        applyPendingDotStyles(dot, delay);
        indicator.appendChild(dot);
      }
      frag.appendChild(indicator);
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

function buildPickedEvidenceChip(doc: Document, evidence: PickedEvidence): HTMLElement {
  // Native <details>/<summary> gives us free a11y (Enter / Space to toggle,
  // role=group, aria-expanded reflected through the [open] attribute) and
  // keeps state on the element itself, so the renderer's reconciler does not
  // need to track an `open` flag in memory.
  const details = doc.createElement('details');
  details.setAttribute('data-agent-devtools-picked-detail', '');
  applyPickedChipDetailsStyles(details);

  const summary = doc.createElement('summary');
  summary.setAttribute('data-agent-devtools-picked-summary', '');
  applyPickedChipSummaryStyles(summary);
  const label = evidence.componentName || evidence.tagName.toLowerCase();
  const labelSpan = doc.createElement('span');
  labelSpan.textContent = label;
  summary.appendChild(labelSpan);
  const tagSpan = doc.createElement('span');
  tagSpan.textContent = `<${evidence.tagName.toLowerCase()}>`;
  applyPickedChipTagStyles(tagSpan);
  summary.appendChild(tagSpan);
  const caret = doc.createElement('span');
  caret.setAttribute('data-agent-devtools-picked-caret', '');
  caret.textContent = '▾';
  applyPickedChipCaretStyles(caret);
  summary.appendChild(caret);
  details.appendChild(summary);

  const panel = doc.createElement('div');
  panel.setAttribute('data-agent-devtools-picked-panel', '');
  applyPickedPanelStyles(panel);
  populatePickedPanel(doc, panel, evidence);
  details.appendChild(panel);
  return details;
}

function populatePickedPanel(doc: Document, panel: HTMLElement, evidence: PickedEvidence): void {
  if (evidence.source) {
    appendRow(
      doc,
      panel,
      'source',
      `${evidence.source.fileName}:${evidence.source.lineNumber}`,
      true,
    );
  }
  if (evidence.selector && evidence.selector !== evidence.tagName.toLowerCase()) {
    appendRow(doc, panel, 'selector', evidence.selector, true);
  }
  if (evidence.componentChain.length > 0) {
    const chain = evidence.componentChain
      .map((entry) =>
        entry.source
          ? `${entry.componentName} (${entry.source.fileName}:${entry.source.lineNumber})`
          : entry.componentName,
      )
      .join(' → ');
    appendRow(doc, panel, 'chain', chain, false);
  }
  const attributeEntries = Object.entries(evidence.attributes);
  if (attributeEntries.length > 0) {
    appendBlock(
      doc,
      panel,
      'attributes',
      attributeEntries.map(([k, v]) => `${k}="${v}"`).join('\n'),
    );
  }
  if (evidence.boundingRect) {
    const r = evidence.boundingRect;
    appendRow(
      doc,
      panel,
      'boundingRect',
      `${Math.round(r.width)}×${Math.round(r.height)} @ (${Math.round(r.x)}, ${Math.round(r.y)})`,
      true,
    );
  }
  if (evidence.outerHTML) {
    appendBlock(doc, panel, 'outerHTML', evidence.outerHTML);
  }
  if (evidence.propsSnapshot) {
    appendBlock(doc, panel, 'propsSnapshot', evidence.propsSnapshot);
  }
  if (evidence.relatedImports && evidence.relatedImports.length > 0) {
    appendBlock(doc, panel, 'relatedImports', evidence.relatedImports.join('\n'));
  }
  if (evidence.sourceSlice) {
    appendBlock(
      doc,
      panel,
      `sourceSlice (lines ${evidence.sourceSlice.startLine}–${evidence.sourceSlice.endLine})`,
      evidence.sourceSlice.code,
    );
  }
}

function appendRow(
  doc: Document,
  panel: HTMLElement,
  labelText: string,
  valueText: string,
  mono: boolean,
): void {
  const row = doc.createElement('div');
  applyPickedRowStyles(row);
  const label = doc.createElement('span');
  label.textContent = labelText;
  applyPickedRowLabelStyles(label);
  row.appendChild(label);
  const value = doc.createElement('span');
  value.textContent = valueText;
  applyPickedRowValueStyles(value, mono);
  row.appendChild(value);
  panel.appendChild(row);
}

function appendBlock(
  doc: Document,
  panel: HTMLElement,
  labelText: string,
  valueText: string,
): void {
  const wrapper = doc.createElement('div');
  applyPickedBlockStyles(wrapper);
  const label = doc.createElement('span');
  label.textContent = labelText;
  applyPickedBlockLabelStyles(label);
  wrapper.appendChild(label);
  const pre = doc.createElement('pre');
  pre.textContent = valueText;
  applyPickedBlockPreStyles(pre);
  wrapper.appendChild(pre);
  panel.appendChild(wrapper);
}

function applyPickedChipDetailsStyles(el: HTMLElement): void {
  const s = el.style;
  s.maxWidth = '85%';
  s.fontSize = '11px';
}

function applyPickedChipSummaryStyles(el: HTMLElement): void {
  const s = el.style;
  s.display = 'inline-flex';
  s.alignItems = 'center';
  s.gap = '6px';
  s.padding = '2px 8px';
  s.borderRadius = '999px';
  s.background = 'rgba(0, 0, 0, 0.06)';
  s.color = '#1a1a1a';
  s.cursor = 'pointer';
  s.userSelect = 'none';
  s.listStyle = 'none';
}

function applyPickedChipTagStyles(el: HTMLElement): void {
  const s = el.style;
  s.fontFamily =
    'ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, Consolas, "Liberation Mono", monospace';
  s.fontSize = '10px';
  s.opacity = '0.6';
}

function applyPickedChipCaretStyles(el: HTMLElement): void {
  const s = el.style;
  s.fontSize = '10px';
  s.opacity = '0.6';
  s.marginLeft = '2px';
}

function applyPickedPanelStyles(el: HTMLElement): void {
  const s = el.style;
  s.marginTop = '6px';
  s.padding = '8px 10px';
  s.borderRadius = '8px';
  s.background = '#1a1a1a';
  s.color = '#f5f5f5';
  s.maxWidth = '100%';
  s.display = 'flex';
  s.flexDirection = 'column';
  s.gap = '6px';
  s.fontSize = '11px';
  s.lineHeight = '1.4';
}

function applyPickedRowStyles(el: HTMLElement): void {
  const s = el.style;
  s.display = 'flex';
  s.gap = '8px';
  s.alignItems = 'baseline';
}

function applyPickedRowLabelStyles(el: HTMLElement): void {
  const s = el.style;
  s.opacity = '0.6';
  s.flex = '0 0 auto';
}

function applyPickedRowValueStyles(el: HTMLElement, mono: boolean): void {
  const s = el.style;
  s.flex = '1 1 auto';
  s.minWidth = '0';
  s.wordBreak = 'break-all';
  if (mono) {
    s.fontFamily =
      'ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, Consolas, "Liberation Mono", monospace';
  }
}

function applyPickedBlockStyles(el: HTMLElement): void {
  const s = el.style;
  s.display = 'flex';
  s.flexDirection = 'column';
  s.gap = '2px';
}

function applyPickedBlockLabelStyles(el: HTMLElement): void {
  const s = el.style;
  s.opacity = '0.6';
}

function applyPickedBlockPreStyles(el: HTMLElement): void {
  const s = el.style;
  s.margin = '0';
  s.padding = '6px 8px';
  s.background = 'rgba(255, 255, 255, 0.06)';
  s.borderRadius = '6px';
  s.fontFamily =
    'ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, Consolas, "Liberation Mono", monospace';
  s.fontSize = '10.5px';
  s.maxHeight = '180px';
  s.overflow = 'auto';
  s.whiteSpace = 'pre-wrap';
  s.wordBreak = 'break-all';
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

function applyAssistantPendingStyles(el: HTMLElement): void {
  const s = el.style;
  s.padding = '10px 14px';
  s.borderRadius = '14px 14px 14px 4px';
  s.background = 'rgba(0, 0, 0, 0.04)';
  s.display = 'inline-flex';
  s.alignItems = 'center';
  s.gap = '4px';
}

function applyPendingDotStyles(el: HTMLElement, delayMs: number): void {
  const s = el.style;
  s.display = 'inline-block';
  s.width = '6px';
  s.height = '6px';
  s.borderRadius = '50%';
  s.background = '#1a1a1a';
  s.opacity = '0.25';
  s.animation = 'agent-devtools-pending-dot 1.4s ease-in-out infinite';
  s.animationDelay = `${delayMs}ms`;
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
