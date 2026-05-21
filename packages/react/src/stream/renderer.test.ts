import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStreamRenderer } from './renderer.js';
import { createMessageStore } from './store.js';

function counterIds(): () => string {
  let n = 0;
  return () => `id-${++n}`;
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
    store.appendUserMessage('what is this?', '<Header>');
    const [first] = items(handle);
    expect(first?.textContent).toContain('<Header>');
    expect(first?.textContent).toContain('what is this?');
    handle.destroy();
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
    expect(items(handle)).toHaveLength(2);
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
});
