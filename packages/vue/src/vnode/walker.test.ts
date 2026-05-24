import { describe, expect, it } from 'vitest';
import { walkComponentAncestors } from './walker.js';
import type { ComponentInstanceLike } from './types.js';

interface MutableInstance {
  uid: number;
  type: { name?: string; __name?: string; __file?: string } | null;
  parent: MutableInstance | null;
}

function chain(...nodes: MutableInstance[]): MutableInstance | null {
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const current = nodes[i];
    const next = nodes[i + 1];
    if (current && next) current.parent = next;
  }
  const tail = nodes[nodes.length - 1];
  if (tail) tail.parent = null;
  return nodes[0] ?? null;
}

describe('walkComponentAncestors', () => {
  it('yields nothing when start is null', () => {
    expect(Array.from(walkComponentAncestors(null))).toEqual([]);
  });

  it('yields the named ancestor chain leaf-first', () => {
    const leaf: MutableInstance = { uid: 1, type: { name: 'Leaf' }, parent: null };
    const middle: MutableInstance = { uid: 2, type: { name: 'Middle' }, parent: null };
    const root: MutableInstance = { uid: 3, type: { name: 'Root' }, parent: null };
    chain(leaf, middle, root);
    const names = Array.from(walkComponentAncestors(leaf as ComponentInstanceLike)).map(
      (i) => (i.type as { name?: string }).name,
    );
    expect(names).toEqual(['Leaf', 'Middle', 'Root']);
  });

  it('skips ancestors without resolvable identity', () => {
    const leaf: MutableInstance = { uid: 1, type: { name: 'Leaf' }, parent: null };
    const anon: MutableInstance = { uid: 2, type: null, parent: null };
    const root: MutableInstance = { uid: 3, type: { name: 'Root' }, parent: null };
    chain(leaf, anon, root);
    const names = Array.from(walkComponentAncestors(leaf as ComponentInstanceLike)).map(
      (i) => (i.type as { name?: string }).name,
    );
    expect(names).toEqual(['Leaf', 'Root']);
  });

  it('caps emission at maxDepth named ancestors', () => {
    const nodes: MutableInstance[] = Array.from({ length: 15 }, (_, i) => ({
      uid: i,
      type: { name: `C${i}` },
      parent: null,
    }));
    chain(...nodes);
    const start = nodes[0];
    if (!start) throw new Error('test setup: missing start node');
    const result = Array.from(
      walkComponentAncestors(start as ComponentInstanceLike, { maxDepth: 5 }),
    );
    expect(result).toHaveLength(5);
  });

  it('is cycle-safe', () => {
    const a: MutableInstance = { uid: 1, type: { name: 'A' }, parent: null };
    const b: MutableInstance = { uid: 2, type: { name: 'B' }, parent: null };
    a.parent = b;
    b.parent = a;
    const result = Array.from(walkComponentAncestors(a as ComponentInstanceLike));
    expect(result).toHaveLength(2);
  });

  it('accepts __name as an identity signal', () => {
    const node: MutableInstance = { uid: 1, type: { __name: 'SfcName' }, parent: null };
    const result = Array.from(walkComponentAncestors(node as ComponentInstanceLike));
    expect(result).toHaveLength(1);
  });
});
