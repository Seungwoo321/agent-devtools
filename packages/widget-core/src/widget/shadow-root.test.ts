import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createShadowWidgetRoot } from './shadow-root.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('createShadowWidgetRoot', () => {
  it('attaches a custom-tag host to document.body by default', () => {
    const root = createShadowWidgetRoot();
    expect(root.host.tagName.toLowerCase()).toBe('agent-devtools-widget');
    expect(root.host.parentElement).toBe(document.body);
    expect(root.host.hasAttribute('data-agent-devtools-widget')).toBe(true);
    root.destroy();
  });

  it('uses a closed shadow root by default (host.shadowRoot returns null)', () => {
    const root = createShadowWidgetRoot();
    expect(root.host.shadowRoot).toBeNull();
    expect(root.shadowRoot).toBeDefined();
    root.destroy();
  });

  it('exposes an open shadow root when openMode is true', () => {
    const root = createShadowWidgetRoot({ openMode: true });
    expect(root.host.shadowRoot).toBe(root.shadowRoot);
    root.destroy();
  });

  it('mounts a [data-widget-container] div inside the shadow root', () => {
    const root = createShadowWidgetRoot({ openMode: true });
    const container = root.shadowRoot.querySelector('[data-widget-container]');
    expect(container).toBe(root.container);
    expect(root.container.tagName.toLowerCase()).toBe('div');
    root.destroy();
  });

  it('installs base isolation styles', () => {
    const root = createShadowWidgetRoot({ openMode: true });
    const style = root.shadowRoot.querySelector('style');
    expect(style?.textContent ?? '').toContain(':host');
    expect(style?.textContent ?? '').toContain('all: initial');
    expect(style?.textContent ?? '').toContain('[data-widget-container]');
    root.destroy();
  });

  it('declares a light color-scheme baseline and reads text from a fallback token', () => {
    const root = createShadowWidgetRoot({ openMode: true });
    const text = root.shadowRoot.querySelector('style')?.textContent ?? '';
    // Light is the *absence* of dark tokens — the base only pins the scheme
    // and reads the primary text colour through a literal fallback.
    expect(text).toContain('color-scheme: light;');
    expect(text).toContain('color: var(--adt-text, #1a1a1a);');
    // No light token block exists; the only `--adt-surface` definition is the
    // dark override.
    expect(text).not.toContain('--adt-surface: #ffffff');
  });

  it('defines the dark palette once and applies it to explicit dark + auto-dark', () => {
    const root = createShadowWidgetRoot({ openMode: true });
    const text = root.shadowRoot.querySelector('style')?.textContent ?? '';
    expect(text).toContain(':host([data-theme="dark"])');
    expect(text).toContain('--adt-surface: #1e1e1e;');
    expect(text).toContain('--adt-text: #e8e8ea;');
    // The picked-element chip fill reads `--adt-chip-bg`; it must stay an
    // opaque hex in dark too so the conversation stream cannot bleed through.
    expect(text).toContain('--adt-chip-bg: #2f2f33;');
    expect(text).toContain('@media (prefers-color-scheme: dark)');
    expect(text).toContain(':host([data-theme="auto"])');
    // The dark palette is interpolated in both selectors, so its tokens
    // appear twice — once for explicit dark, once for auto-follows-OS.
    const occurrences = text.split('--adt-surface: #1e1e1e;').length - 1;
    expect(occurrences).toBe(2);
    root.destroy();
  });

  it('appends extraStyles after base styles', () => {
    const root = createShadowWidgetRoot({
      openMode: true,
      extraStyles: '.custom { color: red; }',
    });
    const style = root.shadowRoot.querySelector('style');
    const text = style?.textContent ?? '';
    expect(text).toContain('all: initial');
    expect(text).toContain('.custom { color: red; }');
    expect(text.indexOf('all: initial')).toBeLessThan(text.indexOf('.custom'));
    root.destroy();
  });

  it('throws when a widget is already mounted in the same document', () => {
    const root = createShadowWidgetRoot();
    expect(() => createShadowWidgetRoot()).toThrow(/already mounted/);
    root.destroy();
  });

  it('allows remounting after destroy', () => {
    const first = createShadowWidgetRoot();
    first.destroy();
    const second = createShadowWidgetRoot();
    expect(second.host.parentElement).toBe(document.body);
    second.destroy();
  });

  it('destroy removes the host from the document', () => {
    const root = createShadowWidgetRoot();
    expect(document.querySelector('[data-agent-devtools-widget]')).toBe(root.host);
    root.destroy();
    expect(document.querySelector('[data-agent-devtools-widget]')).toBeNull();
  });

  it('destroy is idempotent', () => {
    const root = createShadowWidgetRoot();
    root.destroy();
    expect(() => root.destroy()).not.toThrow();
  });

  it('mounts into a custom parent when provided', () => {
    const parent = document.createElement('section');
    document.body.appendChild(parent);
    const root = createShadowWidgetRoot({ parent });
    expect(root.host.parentElement).toBe(parent);
    root.destroy();
  });
});
