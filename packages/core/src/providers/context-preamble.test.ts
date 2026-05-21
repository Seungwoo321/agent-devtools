import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatContextPreamble } from './context-preamble.js';
import { createWorkspace, createFileTools, type FileTools } from '../files/index.js';

function withWorkspace<T>(
  fn: (workspaceRoot: string, files: FileTools) => Promise<T> | T,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'preamble-'));
  const workspace = createWorkspace(dir);
  const files = createFileTools(workspace);
  return Promise.resolve(fn(workspace.root, files)).finally(() => {
    rmSync(dir, { recursive: true, force: true });
  });
}

describe('formatContextPreamble', () => {
  it('returns "" when context is missing or non-object', async () => {
    expect(await formatContextPreamble(undefined)).toBe('');
    expect(await formatContextPreamble(null)).toBe('');
    expect(await formatContextPreamble('string')).toBe('');
    expect(await formatContextPreamble(42)).toBe('');
  });

  it('returns "" when no recognised fields are present', async () => {
    expect(await formatContextPreamble({})).toBe('');
    expect(await formatContextPreamble({ pageContext: {} })).toBe('');
  });

  it('renders url, route, pageFiles and errors under [Page Context]', async () => {
    const out = await formatContextPreamble({
      pageContext: {
        url: 'http://localhost:5173/',
        route: { pathname: '/dashboard' },
        pageFiles: [
          { fileName: '/src/App.tsx', componentName: 'App' },
          { fileName: '/src/Sidebar.tsx', componentName: 'Sidebar' },
          { fileName: '/src/Bare.tsx' },
        ],
        errors: [
          { kind: 'console-error', timestamp: 1, message: 'boom' },
          { kind: 'window-error', timestamp: 2, message: 'kaboom' },
        ],
      },
    });
    expect(out).toContain('[Page Context]');
    expect(out).toContain('URL: http://localhost:5173/');
    expect(out).toContain('Route: /dashboard');
    expect(out).toContain('  - /src/App.tsx :: App');
    expect(out).toContain('  - /src/Sidebar.tsx :: Sidebar');
    expect(out).toContain('  - /src/Bare.tsx');
    expect(out).toContain('  - boom');
    expect(out).toContain('  - kaboom');
  });

  it('caps pageFiles at 20 entries', async () => {
    const pageFiles = Array.from({ length: 30 }, (_, i) => ({
      fileName: `/src/F${String(i)}.tsx`,
      componentName: `F${String(i)}`,
    }));
    const out = await formatContextPreamble({ pageContext: { pageFiles } });
    const listed = out.match(/^\s*-\s+\/src\/F\d+\.tsx/gm) ?? [];
    expect(listed).toHaveLength(20);
  });

  it('caps recent errors at 5', async () => {
    const errors = Array.from({ length: 10 }, (_, i) => ({
      kind: 'console-error',
      timestamp: i,
      message: `err-${String(i)}`,
    }));
    const out = await formatContextPreamble({ pageContext: { errors } });
    const matches = out.match(/^\s*-\s+err-\d+$/gm) ?? [];
    expect(matches).toHaveLength(5);
  });

  it('renders the picked element with outerHTML, attributes and component chain', async () => {
    const out = await formatContextPreamble({
      pageContext: {
        picked: {
          componentName: 'MyButton',
          tagName: 'BUTTON',
          selector: '#go',
          source: { fileName: '/src/Button.tsx', lineNumber: 5, columnNumber: 3 },
          outerHTML: '<button id="go" class="primary">Go</button>',
          attributes: { id: 'go', class: 'primary', 'data-x': '42' },
          text: 'Go',
          componentChain: [
            { componentName: 'MyButton', source: { fileName: '/src/Button.tsx', lineNumber: 5 } },
            { componentName: 'Layout', source: { fileName: '/src/Layout.tsx', lineNumber: 12 } },
            { componentName: 'App' },
          ],
          propsSnapshot: '{"label":"Go"}',
        },
      },
    });
    expect(out).toContain('[Picked Element]');
    expect(out).toContain('Component: MyButton');
    expect(out).toContain('Tag: BUTTON');
    expect(out).toContain('Selector: #go');
    expect(out).toContain('Source: /src/Button.tsx:5:3');
    expect(out).toContain('Text: Go');
    expect(out).toContain('Attributes:');
    expect(out).toContain('  id="go"');
    expect(out).toContain('  class="primary"');
    expect(out).toContain('  data-x="42"');
    expect(out).toContain('Outer HTML:');
    expect(out).toContain('<button id="go" class="primary">Go</button>');
    expect(out).toContain('Component chain (leaf → root):');
    expect(out).toContain('  - MyButton — /src/Button.tsx:5');
    expect(out).toContain('  - Layout — /src/Layout.tsx:12');
    expect(out).toContain('  - App'); // no source
    expect(out).toContain('Props:');
    expect(out).toContain('{"label":"Go"}');
  });

  it('prefers pageContext.picked over the top-level picked mirror', async () => {
    const out = await formatContextPreamble({
      picked: { componentName: 'Stale' },
      pageContext: {
        picked: { componentName: 'Fresh', tagName: 'DIV', selector: 'div' },
      },
    });
    expect(out).toContain('Component: Fresh');
    expect(out).not.toContain('Stale');
  });

  it('falls back to the top-level picked mirror when pageContext.picked is absent', async () => {
    const out = await formatContextPreamble({
      picked: { componentName: 'TopLevel', tagName: 'DIV', selector: 'div' },
    });
    expect(out).toContain('Component: TopLevel');
  });

  it('inlines source slices for each component in the chain when files is supplied', async () => {
    await withWorkspace(async (root, files) => {
      const buttonContents = [
        "import { type ReactNode } from 'react';",
        '',
        'interface Props { label: string; }',
        '',
        'export function MyButton({ label }: Props) {',
        '  return (',
        '    <button onClick={() => undefined}>',
        '      {label}',
        '    </button>',
        '  );',
        '}',
      ].join('\n');
      writeFileSync(join(root, 'Button.tsx'), buttonContents, 'utf8');

      const out = await formatContextPreamble(
        {
          pageContext: {
            picked: {
              componentName: 'MyButton',
              tagName: 'BUTTON',
              selector: 'button',
              outerHTML: '<button></button>',
              attributes: {},
              componentChain: [
                {
                  componentName: 'MyButton',
                  source: { fileName: join(root, 'Button.tsx'), lineNumber: 5 },
                },
              ],
            },
          },
        },
        { files, contextLines: 2 },
      );

      expect(out).toContain('[Source Slices]');
      expect(out).toContain(`--- ${join(root, 'Button.tsx')} (around line 5) ---`);
      // The slice should fence as code, mark the target line with `>`,
      // and show neighbours with leading whitespace.
      expect(out).toContain('> 5 | export function MyButton({ label }: Props) {');
      expect(out).toContain('  3 | interface Props { label: string; }');
      expect(out).toContain('  7 |     <button onClick={() => undefined}>');
    });
  });

  it('does not inline source slices when files is omitted', async () => {
    const out = await formatContextPreamble({
      pageContext: {
        picked: {
          componentName: 'MyButton',
          tagName: 'BUTTON',
          selector: '#go',
          outerHTML: '<button></button>',
          attributes: {},
          componentChain: [
            {
              componentName: 'MyButton',
              source: { fileName: '/Users/foo/proj/Button.tsx', lineNumber: 5 },
            },
          ],
        },
      },
    });
    expect(out).not.toContain('[Source Slices]');
  });

  it('caps source slices at maxSlices and skips duplicates by fileName', async () => {
    await withWorkspace(async (root, files) => {
      writeFileSync(join(root, 'A.tsx'), 'line1\nline2\nline3\nline4\n', 'utf8');
      writeFileSync(join(root, 'B.tsx'), 'line1\nline2\nline3\nline4\n', 'utf8');
      writeFileSync(join(root, 'C.tsx'), 'line1\nline2\nline3\nline4\n', 'utf8');
      writeFileSync(join(root, 'D.tsx'), 'line1\nline2\nline3\nline4\n', 'utf8');

      const out = await formatContextPreamble(
        {
          pageContext: {
            picked: {
              componentName: 'A',
              tagName: 'DIV',
              selector: 'div',
              outerHTML: '<div></div>',
              attributes: {},
              componentChain: [
                { componentName: 'A', source: { fileName: join(root, 'A.tsx'), lineNumber: 2 } },
                // Duplicate filename — should be deduped.
                { componentName: 'A2', source: { fileName: join(root, 'A.tsx'), lineNumber: 3 } },
                { componentName: 'B', source: { fileName: join(root, 'B.tsx'), lineNumber: 2 } },
                { componentName: 'C', source: { fileName: join(root, 'C.tsx'), lineNumber: 2 } },
                { componentName: 'D', source: { fileName: join(root, 'D.tsx'), lineNumber: 2 } },
              ],
            },
          },
        },
        { files, maxSlices: 2 },
      );

      const slices = out.match(/^--- /gm) ?? [];
      expect(slices).toHaveLength(2);
      expect(out).toContain('A.tsx');
      expect(out).toContain('B.tsx');
      expect(out).not.toContain(' C.tsx');
      expect(out).not.toContain(' D.tsx');
    });
  });

  it('silently skips slices whose file is outside the workspace', async () => {
    await withWorkspace(async (root, files) => {
      writeFileSync(join(root, 'good.tsx'), 'ok\n', 'utf8');

      const out = await formatContextPreamble(
        {
          pageContext: {
            picked: {
              componentName: 'X',
              tagName: 'DIV',
              selector: 'div',
              outerHTML: '<div></div>',
              attributes: {},
              componentChain: [
                {
                  componentName: 'Outside',
                  source: { fileName: '/tmp/definitely-not-in-workspace.tsx', lineNumber: 1 },
                },
                {
                  componentName: 'Inside',
                  source: { fileName: join(root, 'good.tsx'), lineNumber: 1 },
                },
              ],
            },
          },
        },
        { files },
      );

      // The chain still mentions both paths.
      expect(out).toContain('  - Outside — /tmp/definitely-not-in-workspace.tsx:1');
      expect(out).toContain(`  - Inside — ${join(root, 'good.tsx')}:1`);
      // Only the in-workspace one gets a slice rendered.
      const slices = out.match(/^--- /gm) ?? [];
      expect(slices).toHaveLength(1);
      expect(out).toContain(`--- ${join(root, 'good.tsx')} (around line 1) ---`);
    });
  });

  it('falls back to picked.source when componentChain is empty', async () => {
    await withWorkspace(async (root, files) => {
      writeFileSync(join(root, 'host.tsx'), 'a\nb\nc\nd\ne\n', 'utf8');
      const out = await formatContextPreamble(
        {
          pageContext: {
            picked: {
              componentName: 'div',
              tagName: 'DIV',
              selector: 'div',
              outerHTML: '<div></div>',
              attributes: {},
              componentChain: [],
              source: { fileName: join(root, 'host.tsx'), lineNumber: 3 },
            },
          },
        },
        { files, contextLines: 1 },
      );
      expect(out).toContain(`--- ${join(root, 'host.tsx')} (around line 3) ---`);
      expect(out).toContain('> 3 | c');
    });
  });

  it('clamps line numbers past the end of the file', async () => {
    await withWorkspace(async (root, files) => {
      writeFileSync(join(root, 'short.tsx'), 'one\ntwo\n', 'utf8');
      const out = await formatContextPreamble(
        {
          pageContext: {
            picked: {
              componentName: 'X',
              tagName: 'DIV',
              selector: 'div',
              outerHTML: '<div></div>',
              attributes: {},
              componentChain: [
                {
                  componentName: 'X',
                  source: { fileName: join(root, 'short.tsx'), lineNumber: 9999 },
                },
              ],
            },
          },
        },
        { files, contextLines: 5 },
      );
      // Should not throw; should render with the available lines.
      expect(out).toContain('one');
      expect(out).toContain('two');
    });
  });
});
