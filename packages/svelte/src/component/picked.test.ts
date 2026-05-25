import { afterEach, describe, expect, it } from 'vitest';
import { describePickedSvelte } from './picked.js';

function tag(el: Element, file: string, line: number, column = 0): void {
  (el as unknown as { __svelte_meta: object }).__svelte_meta = {
    loc: { file, line, column },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('describePickedSvelte', () => {
  it('falls back to lowercased tagName when no svelte meta', () => {
    document.body.innerHTML = '<header id="h">Hi</header>';
    const evidence = describePickedSvelte(document.getElementById('h')!);
    expect(evidence.componentName).toBe('header');
    expect(evidence.componentChain).toEqual([]);
    expect(evidence.source).toBeUndefined();
  });

  it('reads componentName and source from __svelte_meta', () => {
    document.body.innerHTML = '<button id="b">x</button>';
    const button = document.getElementById('b')!;
    tag(button, '/src/Counter.svelte', 7, 4);
    const evidence = describePickedSvelte(button);
    expect(evidence.componentName).toBe('Counter');
    expect(evidence.source).toEqual({
      fileName: '/src/Counter.svelte',
      lineNumber: 7,
      columnNumber: 4,
    });
  });

  it('strips Vite /@fs/ prefix from source paths', () => {
    document.body.innerHTML = '<div id="d">x</div>';
    const div = document.getElementById('d')!;
    tag(div, '/@fs/Users/me/proj/src/App.svelte', 1);
    const evidence = describePickedSvelte(div);
    expect(evidence.source?.fileName).toBe('/Users/me/proj/src/App.svelte');
    expect(evidence.componentName).toBe('App');
  });
});
