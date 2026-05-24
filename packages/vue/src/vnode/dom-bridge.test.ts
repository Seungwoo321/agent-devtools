import { describe, expect, it } from 'vitest';
import { getComponentInstanceForElement } from './dom-bridge.js';

describe('getComponentInstanceForElement', () => {
  it('returns the component instance stored on __vueParentComponent', () => {
    const fakeInstance = { uid: 1, type: { name: 'Demo' }, parent: null };
    const element = document.createElement('div');
    (element as unknown as { __vueParentComponent: unknown }).__vueParentComponent = fakeInstance;
    expect(getComponentInstanceForElement(element)).toBe(fakeInstance);
  });

  it('returns null for plain DOM nodes without the property', () => {
    const element = document.createElement('span');
    expect(getComponentInstanceForElement(element)).toBeNull();
  });

  it('returns null for null / undefined input', () => {
    expect(getComponentInstanceForElement(null)).toBeNull();
    expect(getComponentInstanceForElement(undefined)).toBeNull();
  });

  it('returns null when the property value is not an object', () => {
    const element = document.createElement('div');
    (element as unknown as { __vueParentComponent: unknown }).__vueParentComponent =
      'not an object';
    expect(getComponentInstanceForElement(element)).toBeNull();
  });
});
