import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PickedEvidence } from '../context/types.js';
import { createStreamRenderer } from './renderer.js';
import { createMessageStore } from './store.js';

function counterIds(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

function makeEvidence(overrides: Partial<PickedEvidence> = {}): PickedEvidence {
  return {
    componentName: 'Header',
    tagName: 'DIV',
    selector: 'div.header',
    outerHTML: '<div class="header">Hi</div>',
    attributes: { class: 'header' },
    componentChain: [],
    ...overrides,
  };
}

let container: HTMLElement;

beforeEach(() => {
  // Reset persistence before every test so the default sessionStorage-backed
  // store doesn't carry items between cases.
  try {
    globalThis.sessionStorage?.clear();
  } catch {
    /* environments without sessionStorage are fine */
  }
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  document.body.innerHTML = '';
});

function items(handle: { element: HTMLElement }): HTMLElement[] {
  return Array.from(handle.element.querySelectorAll('[data-agent-devtools-stream-item]'));
}

describe('createStreamRenderer', () => {
  it('mounts a root and renders an initially empty store', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    expect(handle.element.parentElement).toBe(container);
    expect(items(handle)).toHaveLength(0);
    handle.destroy();
  });

  it('renders a user message', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.appendUserMessage('hello');
    const [first] = items(handle);
    expect(first?.textContent).toContain('hello');
    handle.destroy();
  });

  it('renders the picked summary chip for user messages', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.appendUserMessage('what is this?', makeEvidence({ componentName: 'Header' }));
    const [first] = items(handle);
    expect(first?.textContent).toContain('Header');
    expect(first?.textContent).toContain('what is this?');
    handle.destroy();
  });

  describe('picked evidence disclosure on user bubble', () => {
    function userItem(handle: { element: HTMLElement }): HTMLElement | null {
      const list = Array.from(
        handle.element.querySelectorAll<HTMLElement>('[data-agent-devtools-stream-item]'),
      );
      return list.find((el) => el.getAttribute('data-kind') === 'user') ?? null;
    }

    it('defaults to collapsed and exposes a details/summary disclosure', () => {
      const store = createMessageStore({ generateId: counterIds() });
      const handle = createStreamRenderer({ container, store });
      store.appendUserMessage(
        'inspect',
        makeEvidence({
          componentName: 'TodoItem',
          source: { fileName: 'src/TodoItem.tsx', lineNumber: 23 },
        }),
      );
      const node = userItem(handle);
      const details = node?.querySelector<HTMLDetailsElement>(
        '[data-agent-devtools-picked-detail]',
      );
      expect(details).not.toBeNull();
      // The default state is collapsed: the [open] attribute is absent.
      expect(details?.open).toBe(false);
      // The summary label shows the component name; the detail panel is
      // present in the DOM but hidden until the user opens the disclosure.
      expect(
        node?.querySelector('[data-agent-devtools-picked-summary]')?.textContent ?? '',
      ).toContain('TodoItem');
      handle.destroy();
    });

    it('exposes the full evidence payload inside the panel', () => {
      const store = createMessageStore({ generateId: counterIds() });
      const handle = createStreamRenderer({ container, store });
      const evidence = makeEvidence({
        componentName: 'TodoItem',
        tagName: 'BUTTON',
        selector: 'button.todo-item',
        outerHTML: '<button class="todo-item">Buy milk</button>',
        attributes: { class: 'todo-item', 'data-id': '7' },
        componentChain: [
          { componentName: 'TodoItem', source: { fileName: 'src/TodoItem.tsx', lineNumber: 23 } },
          { componentName: 'TodoList', source: { fileName: 'src/TodoList.tsx', lineNumber: 12 } },
        ],
        boundingRect: { x: 10, y: 20, width: 120, height: 32 },
        propsSnapshot: '{"id":7,"label":"Buy milk"}',
        relatedImports: ['src/types.ts', 'src/utils.ts'],
        sourceSlice: {
          code: 'function TodoItem(props) {\n  return <button />;\n}',
          startLine: 20,
          endLine: 24,
        },
      });
      store.appendUserMessage('explain this', evidence);
      const panel = userItem(handle)?.querySelector<HTMLElement>(
        '[data-agent-devtools-picked-panel]',
      );
      expect(panel).not.toBeNull();
      const text = panel?.textContent ?? '';
      // Component chain with source paths.
      expect(text).toContain('TodoItem');
      expect(text).toContain('TodoList');
      expect(text).toContain('src/TodoItem.tsx:23');
      expect(text).toContain('src/TodoList.tsx:12');
      // Attributes.
      expect(text).toContain('class="todo-item"');
      expect(text).toContain('data-id="7"');
      // Bounding rect.
      expect(text).toContain('120×32');
      // Outer HTML preview.
      expect(text).toContain('<button class="todo-item">Buy milk</button>');
      // Related imports and source slice.
      expect(text).toContain('src/types.ts');
      expect(text).toContain('src/utils.ts');
      expect(text).toContain('function TodoItem');
      expect(text).toContain('lines 20–24');
      handle.destroy();
    });

    it('does not render the disclosure when no evidence is attached', () => {
      const store = createMessageStore({ generateId: counterIds() });
      const handle = createStreamRenderer({ container, store });
      store.appendUserMessage('plain message');
      const node = userItem(handle);
      expect(node?.querySelector('[data-agent-devtools-picked-detail]')).toBeNull();
      expect(node?.textContent).toContain('plain message');
      handle.destroy();
    });
  });

  it('appends assistant text deltas in place under the same id', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.applyEvent({ type: 'text-delta', blockId: 'b1', text: 'Hel' });
    const firstSnapshot = items(handle);
    expect(firstSnapshot).toHaveLength(1);
    store.applyEvent({ type: 'text-delta', blockId: 'b1', text: 'lo' });
    const secondSnapshot = items(handle);
    expect(secondSnapshot).toHaveLength(1);
    expect(secondSnapshot[0]).toBe(firstSnapshot[0]);
    expect(secondSnapshot[0]?.textContent).toContain('Hello');
    handle.destroy();
  });

  it('shows a streaming cursor that disappears on text-stop', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.applyEvent({ type: 'text-delta', blockId: 'b1', text: 'hi' });
    expect(items(handle)[0]?.textContent).toContain('▍');
    store.applyEvent({ type: 'text-stop', blockId: 'b1' });
    expect(items(handle)[0]?.textContent ?? '').not.toContain('▍');
    handle.destroy();
  });

  it('renders tool-use with name and accumulating input', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.applyEvent({ type: 'tool-use-start', blockId: 'tu1', name: 'inspect' });
    store.applyEvent({ type: 'tool-use-delta', blockId: 'tu1', partialInput: '{"a":' });
    store.applyEvent({ type: 'tool-use-delta', blockId: 'tu1', partialInput: '1}' });
    store.applyEvent({ type: 'tool-use-stop', blockId: 'tu1' });
    const node = items(handle)[0];
    expect(node?.textContent).toContain('inspect');
    expect(node?.textContent).toContain('{"a":1}');
    handle.destroy();
  });

  it('absorbs a linked tool-result into the matching tool-use as a single item', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.applyEvent({ type: 'tool-use-start', blockId: 'tu1', name: 'inspect' });
    store.applyEvent({ type: 'tool-result', toolUseId: 'tu1', content: 'output text' });
    const all = items(handle);
    // tool-use + tool-result render as ONE collapsible block — agent UIs
    // (Claude.ai, ChatGPT) treat input + output of a single tool
    // invocation as a single unit.
    expect(all).toHaveLength(1);
    const useNode = all[0];
    expect(useNode?.getAttribute('data-kind')).toBe('tool-use');
    expect(useNode?.textContent).toContain('inspect');
    expect(useNode?.textContent).toContain('output text');
    const resultPre = useNode?.querySelector('[data-tool-result]');
    expect(resultPre?.textContent).toBe('output text');
    handle.destroy();
  });

  it('surfaces tool-result errors via the summary label + divider styling', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.applyEvent({ type: 'tool-use-start', blockId: 'tu1', name: 'inspect' });
    store.applyEvent({
      type: 'tool-result',
      toolUseId: 'tu1',
      content: 'stack trace',
      isError: true,
    });
    const all = items(handle);
    expect(all).toHaveLength(1);
    const summary = all[0]?.querySelector('summary');
    expect(summary?.textContent).toContain('error');
    const divider = all[0]?.querySelector('[data-tool-result-divider]');
    expect(divider?.textContent).toContain('error');
    handle.destroy();
  });

  it('re-renders the matching tool-use when a late tool-result arrives, preserving DOM identity', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.applyEvent({ type: 'tool-use-start', blockId: 'tu1', name: 'inspect' });
    store.applyEvent({ type: 'tool-use-stop', blockId: 'tu1' });
    const beforeAll = items(handle);
    expect(beforeAll).toHaveLength(1);
    const useNodeBefore = beforeAll[0];
    expect(useNodeBefore?.querySelector('[data-tool-result]')).toBeNull();
    store.applyEvent({ type: 'tool-result', toolUseId: 'tu1', content: 'late output' });
    const afterAll = items(handle);
    // Same node (mounted map keyed by id), now containing the result.
    expect(afterAll).toHaveLength(1);
    expect(afterAll[0]).toBe(useNodeBefore);
    expect(afterAll[0]?.querySelector('[data-tool-result]')?.textContent).toBe('late output');
    handle.destroy();
  });

  it('renders error events', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.applyEvent({ type: 'error', message: 'transport blew up' });
    expect(items(handle)[0]?.textContent).toContain('transport blew up');
    handle.destroy();
  });

  it('clear empties the rendered list', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.appendUserMessage('a');
    store.appendUserMessage('b');
    // 2 user messages + 1 pending placeholder behind the latest turn.
    expect(items(handle)).toHaveLength(3);
    store.clear();
    expect(items(handle)).toHaveLength(0);
    handle.destroy();
  });

  it('destroy removes the root and stops further renders', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    handle.destroy();
    expect(container.children.length).toBe(0);
    store.appendUserMessage('after destroy');
    expect(container.children.length).toBe(0);
  });

  it('refresh() can be called manually', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.appendUserMessage('hi');
    expect(() => handle.refresh()).not.toThrow();
    handle.destroy();
  });

  it('renders tool-use inside a collapsed <details> by default', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.applyEvent({ type: 'tool-use-start', blockId: 'tu1', name: 'inspect' });
    store.applyEvent({ type: 'tool-use-delta', blockId: 'tu1', partialInput: '{"a":1}' });
    store.applyEvent({ type: 'tool-use-stop', blockId: 'tu1' });
    const node = items(handle)[0];
    const details = node?.querySelector('details');
    const summary = node?.querySelector('summary');
    expect(details).not.toBeNull();
    expect(details?.hasAttribute('open')).toBe(false);
    expect(summary?.textContent).toContain('inspect');
    handle.destroy();
  });

  it('keeps the paired tool block collapsed by default — result content is hidden until toggled', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.applyEvent({ type: 'tool-use-start', blockId: 'tu1', name: 'inspect' });
    store.applyEvent({ type: 'tool-result', toolUseId: 'tu1', content: 'output text' });
    const node = items(handle)[0];
    const details = node?.querySelector('details');
    expect(details).not.toBeNull();
    expect(details?.hasAttribute('open')).toBe(false);
    expect(details?.querySelector('[data-tool-result]')?.textContent).toBe('output text');
    handle.destroy();
  });

  it('keeps user/assistant items as plain blocks (no <details> wrapper)', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.appendUserMessage('hello');
    store.applyEvent({ type: 'text-delta', blockId: 'b1', text: 'reply' });
    const [userNode, assistantNode] = items(handle);
    expect(userNode?.querySelector('details')).toBeNull();
    expect(assistantNode?.querySelector('details')).toBeNull();
    handle.destroy();
  });

  it('renders assistant markdown — bold/code/lists become real DOM, not literal source', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.applyEvent({
      type: 'text-delta',
      blockId: 'b1',
      text: '**hi** `code` and:\n- one\n- two',
    });
    store.applyEvent({ type: 'text-stop', blockId: 'b1' });
    const node = items(handle)[0];
    expect(node?.querySelector('strong')?.textContent).toBe('hi');
    expect(node?.querySelector('code')?.textContent).toBe('code');
    expect(node?.querySelectorAll('li')).toHaveLength(2);
    // Source-form asterisks must not survive (means parser actually ran).
    expect(node?.textContent).not.toContain('**hi**');
    handle.destroy();
  });

  it('renders fenced code blocks for assistant text', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.applyEvent({
      type: 'text-delta',
      blockId: 'b1',
      text: 'try:\n```ts\nconst x = 1;\n```',
    });
    store.applyEvent({ type: 'text-stop', blockId: 'b1' });
    const node = items(handle)[0];
    // marked emits <pre><code class="language-ts">…</code></pre> for fenced blocks.
    const codeBlock = node?.querySelector('pre code');
    expect(codeBlock?.textContent ?? '').toContain('const x = 1;');
    handle.destroy();
  });

  it('strips <script> and event handlers from assistant markdown (XSS guard)', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.applyEvent({
      type: 'text-delta',
      blockId: 'b1',
      text: 'before<script>window.__pwned = true</script>after<img src=x onerror="window.__pwned2=1">',
    });
    store.applyEvent({ type: 'text-stop', blockId: 'b1' });
    const node = items(handle)[0];
    // The sanitiser drops <script> entirely and `onerror` attributes from
    // any element that survives.
    expect(node?.querySelector('script')).toBeNull();
    const survivingImg = node?.querySelector('img');
    expect(survivingImg?.getAttribute('onerror')).toBeNull();
    // The surrounding literal text still renders so the assistant message
    // remains readable rather than getting wiped to empty by the sanitiser.
    expect(node?.textContent).toContain('before');
    expect(node?.textContent).toContain('after');
    expect((globalThis as { __pwned?: unknown }).__pwned).toBeUndefined();
    handle.destroy();
  });

  it('keeps the streaming cursor visible while assistant text is streaming', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.applyEvent({ type: 'text-delta', blockId: 'b1', text: '**partial' });
    const node = items(handle)[0];
    // Cursor must be present alongside the (still-streaming, possibly
    // malformed) markdown — the parser shouldn't choke on half a fence.
    expect(node?.textContent).toContain('▍');
    store.applyEvent({ type: 'text-stop', blockId: 'b1' });
    expect(items(handle)[0]?.textContent ?? '').not.toContain('▍');
    handle.destroy();
  });

  it('keeps stable DOM identity for items across re-renders', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.appendUserMessage('a');
    const firstA = items(handle)[0];
    store.appendUserMessage('b');
    const [a, b] = items(handle);
    expect(a).toBe(firstA);
    expect(b).not.toBe(firstA);
    handle.destroy();
  });

  it('paints a pending typing indicator immediately after a user turn', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.appendUserMessage('hello');
    const [, pendingNode] = items(handle);
    expect(pendingNode?.getAttribute('data-kind')).toBe('assistant-pending');
    const dots = pendingNode?.querySelectorAll('[data-agent-devtools-pending-dot]');
    expect(dots?.length).toBe(3);
    handle.destroy();
  });

  it('drops the pending indicator on the first text delta of the turn', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.appendUserMessage('hello');
    expect(items(handle).some((n) => n.getAttribute('data-kind') === 'assistant-pending')).toBe(
      true,
    );
    store.applyEvent({ type: 'text-delta', blockId: 'b1', text: 'hi' });
    const kinds = items(handle).map((n) => n.getAttribute('data-kind'));
    expect(kinds).not.toContain('assistant-pending');
    expect(kinds).toContain('assistant-text');
    handle.destroy();
  });

  it('drops the pending indicator on the first tool-use-start of the turn', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.appendUserMessage('go');
    store.applyEvent({ type: 'tool-use-start', blockId: 'tu1', name: 'inspect' });
    const kinds = items(handle).map((n) => n.getAttribute('data-kind'));
    expect(kinds).not.toContain('assistant-pending');
    expect(kinds).toContain('tool-use');
    handle.destroy();
  });

  it('drops the pending indicator on an error event', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.appendUserMessage('go');
    store.applyEvent({ type: 'error', message: 'boom' });
    const kinds = items(handle).map((n) => n.getAttribute('data-kind'));
    expect(kinds).not.toContain('assistant-pending');
    expect(kinds).toContain('error');
    handle.destroy();
  });

  it('drops the pending indicator on a done event with no content', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.appendUserMessage('go');
    store.applyEvent({ type: 'done' });
    const kinds = items(handle).map((n) => n.getAttribute('data-kind'));
    expect(kinds).not.toContain('assistant-pending');
    handle.destroy();
  });

  it('re-paints the working indicator after a tool result while the model round-trips', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.appendUserMessage('go');
    store.applyEvent({ type: 'tool-use-start', blockId: 'tu1', name: 'inspect' });
    // Streaming the tool input — indicator hidden.
    expect(items(handle).some((n) => n.getAttribute('data-kind') === 'assistant-pending')).toBe(
      false,
    );
    store.applyEvent({ type: 'tool-use-stop', blockId: 'tu1' });
    store.applyEvent({ type: 'tool-result', toolUseId: 'tu1', content: 'ok' });
    // tool-result is folded into the tool-use <details>, so the only
    // top-level nodes are the user bubble, the tool-use block, and the
    // re-painted indicator at the tail.
    const rendered = items(handle);
    const last = rendered[rendered.length - 1];
    expect(last?.getAttribute('data-kind')).toBe('assistant-pending');
    expect(last?.querySelectorAll('[data-agent-devtools-pending-dot]').length).toBe(3);
    handle.destroy();
  });

  it('injects keyframes for the pending dot animation as a sibling of the root', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    const styleEl = container.querySelector('style[data-agent-devtools-stream-style]');
    expect(styleEl).not.toBeNull();
    expect(styleEl?.textContent ?? '').toContain('@keyframes agent-devtools-pending-dot');
    // The style element must live outside `root` so the renderer's child
    // pruning never sweeps it away between renders.
    expect(styleEl?.parentElement).toBe(container);
    expect(styleEl?.parentElement).not.toBe(handle.element);
    handle.destroy();
    expect(container.querySelector('style[data-agent-devtools-stream-style]')).toBeNull();
  });

  it('scrollToBottom re-anchors the list to the latest item', () => {
    const store = createMessageStore({ generateId: counterIds() });
    const handle = createStreamRenderer({ container, store });
    store.appendUserMessage('a');
    store.appendUserMessage('b');
    // Simulate the user (or a hidden-then-visible panel) scrolling away.
    handle.element.scrollTop = 0;
    Object.defineProperty(handle.element, 'scrollHeight', {
      configurable: true,
      value: 999,
    });
    handle.scrollToBottom();
    expect(handle.element.scrollTop).toBe(999);
    handle.destroy();
  });

  describe('smooth assistant-text reveal', () => {
    // Manual frame stepper: callbacks are queued and only fire when the
    // test explicitly calls `step()`. This isolates the cadence loop from
    // jsdom's setTimeout-backed requestAnimationFrame so we can observe
    // each frame deterministically.
    function manualScheduler(): {
      schedule: (cb: () => void) => () => void;
      step: () => void;
      pending: () => number;
    } {
      const queue: Array<{ cb: () => void; cancelled: boolean }> = [];
      const schedule = (cb: () => void): (() => void) => {
        const entry = { cb, cancelled: false };
        queue.push(entry);
        return () => {
          entry.cancelled = true;
        };
      };
      const step = (): void => {
        const next = queue.shift();
        if (!next || next.cancelled) return;
        next.cb();
      };
      const pending = (): number => queue.filter((e) => !e.cancelled).length;
      return { schedule, step, pending };
    }

    function textOf(handle: { element: HTMLElement }): string {
      // Markdown rendering wraps text in <p>, which jsdom serialises with
      // a trailing newline. Strip the streaming cursor glyph and any
      // surrounding whitespace so length comparisons reflect the actual
      // revealed slice.
      const node = items(handle)[0];
      return (node?.textContent ?? '').replace(/▍/g, '').trim();
    }

    it('reveals lumpy text-deltas at a steady cadence over multiple frames', () => {
      const scheduler = manualScheduler();
      const store = createMessageStore({ generateId: counterIds() });
      const handle = createStreamRenderer({
        container,
        store,
        frameScheduler: scheduler.schedule,
      });
      // 32-char burst → cadence aims to drain over ~16 frames (≥1/frame).
      const burst = 'abcdefghijklmnopqrstuvwxyz012345';
      store.applyEvent({ type: 'text-delta', blockId: 'b1', text: burst });

      // Initial paint: nothing revealed yet because streaming + scheduler.
      expect(textOf(handle).length).toBe(0);
      expect(scheduler.pending()).toBe(1);

      // Step ten frames; should grow roughly linearly, never overshoot.
      const lengths: number[] = [];
      for (let i = 0; i < 10; i += 1) {
        scheduler.step();
        lengths.push(textOf(handle).length);
      }
      expect(lengths[0]).toBeGreaterThan(0);
      // Monotonic growth — text only ever grows during reveal.
      for (let i = 1; i < lengths.length; i += 1) {
        expect(lengths[i]).toBeGreaterThanOrEqual(lengths[i - 1] ?? 0);
      }
      // Never exceeds the store text.
      expect(lengths[lengths.length - 1]).toBeLessThanOrEqual(burst.length);
      // Drain the rest of the queue (safety cap prevents an infinite loop
      // if the reveal logic ever fails to converge).
      let safety = 1000;
      while (scheduler.pending() > 0 && safety > 0) {
        scheduler.step();
        safety -= 1;
      }
      expect(textOf(handle)).toBe(burst);
      handle.destroy();
    });

    it('snaps to full text immediately when streaming flips to false', () => {
      const scheduler = manualScheduler();
      const store = createMessageStore({ generateId: counterIds() });
      const handle = createStreamRenderer({
        container,
        store,
        frameScheduler: scheduler.schedule,
      });
      store.applyEvent({ type: 'text-delta', blockId: 'b1', text: 'abcdefghijklmnop' });
      // Step a couple frames so only a slice is rendered.
      scheduler.step();
      scheduler.step();
      const midLength = textOf(handle).length;
      expect(midLength).toBeGreaterThan(0);
      expect(midLength).toBeLessThan(16);

      store.applyEvent({ type: 'text-stop', blockId: 'b1' });
      // Without stepping any further frames the rendered text must equal
      // the full received text and the cursor must be gone.
      expect(textOf(handle)).toBe('abcdefghijklmnop');
      const node = items(handle)[0];
      expect(node?.textContent ?? '').not.toContain('▍');
      handle.destroy();
    });

    it('destroy cancels any pending animation frame and clears reveal state', () => {
      const scheduler = manualScheduler();
      const store = createMessageStore({ generateId: counterIds() });
      const handle = createStreamRenderer({
        container,
        store,
        frameScheduler: scheduler.schedule,
      });
      store.applyEvent({ type: 'text-delta', blockId: 'b1', text: 'hello world' });
      // A frame is queued.
      expect(scheduler.pending()).toBe(1);
      handle.destroy();
      // After destroy the queued entry is cancelled, so stepping is a no-op.
      expect(scheduler.pending()).toBe(0);
      // Stepping the cancelled entry should not throw or render.
      expect(() => scheduler.step()).not.toThrow();
    });
  });
});
