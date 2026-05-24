import { describe, expect, it } from 'vitest';
import { getComponentInstanceForElement } from './dom-bridge.js';

describe('getComponentInstanceForElement', () => {
  it('returns the instance stored on __vue__ for the element itself', () => {
    const fakeInstance = { _uid: 1, $options: { name: 'Demo' }, $parent: null };
    const element = document.createElement('div');
    (element as unknown as { __vue__: unknown }).__vue__ = fakeInstance;
    expect(getComponentInstanceForElement(element)).toBe(fakeInstance);
  });

  it('walks up the DOM tree until it finds __vue__ on an ancestor', () => {
    const fakeInstance = { _uid: 1, $options: { name: 'Root' }, $parent: null };
    const root = document.createElement('section');
    (root as unknown as { __vue__: unknown }).__vue__ = fakeInstance;
    const inner = document.createElement('span');
    root.appendChild(inner);
    document.body.appendChild(root);
    expect(getComponentInstanceForElement(inner)).toBe(fakeInstance);
  });

  it('returns null for plain DOM nodes without the property anywhere in chain', () => {
    const element = document.createElement('span');
    document.body.appendChild(element);
    expect(getComponentInstanceForElement(element)).toBeNull();
  });

  it('returns null for null / undefined input', () => {
    expect(getComponentInstanceForElement(null)).toBeNull();
    expect(getComponentInstanceForElement(undefined)).toBeNull();
  });

  it('returns null when the __vue__ value is not an object', () => {
    const element = document.createElement('div');
    (element as unknown as { __vue__: unknown }).__vue__ = 'not an object';
    expect(getComponentInstanceForElement(element)).toBeNull();
  });
});
