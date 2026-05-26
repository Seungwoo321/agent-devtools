import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSelector } from './selector.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('buildSelector', () => {
  it('returns #id when the element has a safe id', () => {
    const el = document.createElement('div');
    el.id = 'main';
    document.body.appendChild(el);
    expect(buildSelector(el)).toBe('#main');
  });

  it('walks up to the root when no id is present', () => {
    document.body.innerHTML = '<section><article><p>one</p></article></section>';
    const p = document.querySelector('p') as HTMLElement;
    const selector = buildSelector(p, { maxDepth: 10 });
    expect(selector).toBe('html > body > section > article > p');
  });

  it('adds :nth-of-type for repeated siblings of the same tag', () => {
    document.body.innerHTML = '<ul><li>a</li><li>b</li><li>c</li></ul>';
    const second = document.querySelectorAll('li')[1] as HTMLElement;
    expect(buildSelector(second, { maxDepth: 10 })).toMatch(/li:nth-of-type\(2\)$/);
  });

  it('stops at maxDepth and yields a partial selector', () => {
    document.body.innerHTML = '<section><article><p>x</p></article></section>';
    const p = document.querySelector('p') as HTMLElement;
    const selector = buildSelector(p, { maxDepth: 2 });
    // Last two segments only: article > p
    expect(selector).toBe('article > p');
  });

  it('rejects unsafe ids (special characters) and falls back to tag chain', () => {
    document.body.innerHTML = '<div></div>';
    const div = document.querySelector('div') as HTMLElement;
    div.setAttribute('id', 'has space');
    expect(buildSelector(div, { maxDepth: 2 })).toMatch(/div$/);
  });

  it('truncates to a single segment when the ancestor has an id', () => {
    document.body.innerHTML = '<main id="app"><div><span></span></div></main>';
    const span = document.querySelector('span') as HTMLElement;
    expect(buildSelector(span, { maxDepth: 10 })).toBe('#app > div > span');
  });
});
