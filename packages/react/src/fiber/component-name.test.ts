import { describe, expect, it } from 'vitest';
import { resolveComponentName } from './component-name.js';
import type { FiberNodeLike } from './types.js';

function fiber(type: unknown, elementType?: unknown): FiberNodeLike {
  return { type, ...(elementType !== undefined && { elementType }) };
}

describe('resolveComponentName', () => {
  it("returns the host tag name for string types (e.g. 'div')", () => {
    expect(resolveComponentName(fiber('div'))).toBe('div');
  });

  it('returns the function name for a named function component', () => {
    function MyButton() {
      return null;
    }
    expect(resolveComponentName(fiber(MyButton))).toBe('MyButton');
  });

  it('prefers displayName over the function name when set', () => {
    function Inner() {
      return null;
    }
    (Inner as { displayName?: string }).displayName = 'OuterWrapper';
    expect(resolveComponentName(fiber(Inner))).toBe('OuterWrapper');
  });

  it('unwraps React.memo objects (reads inner displayName / name)', () => {
    function MemoInner() {
      return null;
    }
    const memo = { $$typeof: Symbol('react.memo'), type: MemoInner };
    expect(resolveComponentName(fiber(memo))).toBe('MemoInner');
  });

  it('honors displayName on the memo wrapper itself', () => {
    const memo = { $$typeof: Symbol('react.memo'), type: () => null, displayName: 'WrappedMemo' };
    expect(resolveComponentName(fiber(memo))).toBe('WrappedMemo');
  });

  it('unwraps React.forwardRef via the `render` function', () => {
    function refRender() {
      return null;
    }
    const fwd = { $$typeof: Symbol('react.forward_ref'), render: refRender };
    expect(resolveComponentName(fiber(fwd))).toBe('refRender');
  });

  it('falls back to elementType when type is null', () => {
    function FromElement() {
      return null;
    }
    expect(resolveComponentName(fiber(null, FromElement))).toBe('FromElement');
  });

  it("returns 'Unknown' for anonymous function components with no displayName", () => {
    expect(resolveComponentName(fiber(() => null))).toBe('Unknown');
  });

  it("returns 'Unknown' when type is null and elementType is missing", () => {
    expect(resolveComponentName(fiber(null))).toBe('Unknown');
  });

  it('ignores empty / whitespace-only displayName strings', () => {
    function Real() {
      return null;
    }
    (Real as { displayName?: string }).displayName = '   ';
    expect(resolveComponentName(fiber(Real))).toBe('Real');
  });
});
