import { describe, expect, it } from 'vitest';
import { getFiberForElement, getHostRootFiber } from './dom-bridge.js';

interface FakeElement {
  [key: string]: unknown;
}

function makeElement(props: Record<string, unknown>): FakeElement {
  return { ...props };
}

describe('getFiberForElement', () => {
  it('returns the fiber stored under __reactFiber$<random>', () => {
    const fiber = { type: 'div' };
    const el = makeElement({ __reactFiber$abc123: fiber });
    expect(getFiberForElement(el)).toBe(fiber);
  });

  it('finds the property even when the suffix has unusual characters', () => {
    const fiber = { type: 'span' };
    const el = makeElement({ __reactFiber$0_zZ: fiber });
    expect(getFiberForElement(el)).toBe(fiber);
  });

  it('returns null when no fiber key is present', () => {
    expect(getFiberForElement(makeElement({ tagName: 'div' }))).toBeNull();
  });

  it('returns null for null / undefined input', () => {
    expect(getFiberForElement(null)).toBeNull();
    expect(getFiberForElement(undefined)).toBeNull();
  });

  it('does not match the container prefix (__reactContainer$)', () => {
    const fiber = { hostRoot: true };
    const el = makeElement({ __reactContainer$xyz: fiber });
    expect(getFiberForElement(el)).toBeNull();
  });

  it('ignores non-object values stored under the fiber prefix', () => {
    expect(getFiberForElement(makeElement({ __reactFiber$abc: null }))).toBeNull();
    expect(getFiberForElement(makeElement({ __reactFiber$abc: 'not a fiber' }))).toBeNull();
  });
});

describe('getHostRootFiber', () => {
  it('returns the fiber under __reactContainer$<random>', () => {
    const hostRoot = { stateNode: { containerInfo: {} } };
    const container = makeElement({ __reactContainer$root1: hostRoot });
    expect(getHostRootFiber(container)).toBe(hostRoot);
  });

  it('does not match the element fiber prefix (__reactFiber$)', () => {
    const elementFiber = { type: 'div' };
    const container = makeElement({ __reactFiber$abc: elementFiber });
    expect(getHostRootFiber(container)).toBeNull();
  });

  it('returns null when the container has no react-attached root', () => {
    expect(getHostRootFiber(makeElement({}))).toBeNull();
  });

  it('returns null for null / undefined input', () => {
    expect(getHostRootFiber(null)).toBeNull();
    expect(getHostRootFiber(undefined)).toBeNull();
  });
});
