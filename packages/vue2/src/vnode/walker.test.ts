import { describe, expect, it } from 'vitest';
import { walkComponentAncestors } from './walker.js';
import type { Vue2ComponentInstance, Vue2ComponentOptions } from './types.js';

interface MutableInstance {
  _uid: number;
  $options: Vue2ComponentOptions | undefined;
  $parent: MutableInstance | null;
}

function chain(...nodes: MutableInstance[]): MutableInstance | null {
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const current = nodes[i];
    const next = nodes[i + 1];
    if (current && next) current.$parent = next;
  }
  const tail = nodes[nodes.length - 1];
  if (tail) tail.$parent = null;
  return nodes[0] ?? null;
}

describe('walkComponentAncestors', () => {
  it('yields nothing when start is null', () => {
    expect(Array.from(walkComponentAncestors(null))).toEqual([]);
  });

  it('yields the named ancestor chain leaf-first', () => {
    const leaf: MutableInstance = { _uid: 1, $options: { name: 'Leaf' }, $parent: null };
    const middle: MutableInstance = { _uid: 2, $options: { name: 'Middle' }, $parent: null };
    const root: MutableInstance = { _uid: 3, $options: { name: 'Root' }, $parent: null };
    chain(leaf, middle, root);
    const names = Array.from(walkComponentAncestors(leaf as Vue2ComponentInstance)).map(
      (i) => i.$options?.name,
    );
    expect(names).toEqual(['Leaf', 'Middle', 'Root']);
  });

  it('skips ancestors without resolvable identity', () => {
    const leaf: MutableInstance = { _uid: 1, $options: { name: 'Leaf' }, $parent: null };
    const anon: MutableInstance = { _uid: 2, $options: undefined, $parent: null };
    const root: MutableInstance = { _uid: 3, $options: { name: 'Root' }, $parent: null };
    chain(leaf, anon, root);
    const names = Array.from(walkComponentAncestors(leaf as Vue2ComponentInstance)).map(
      (i) => i.$options?.name,
    );
    expect(names).toEqual(['Leaf', 'Root']);
  });

  it('caps emission at maxDepth named ancestors', () => {
    const nodes: MutableInstance[] = Array.from({ length: 15 }, (_, i) => ({
      _uid: i,
      $options: { name: `C${i}` },
      $parent: null,
    }));
    chain(...nodes);
    const start = nodes[0];
    if (!start) throw new Error('test setup: missing start node');
    const result = Array.from(
      walkComponentAncestors(start as Vue2ComponentInstance, { maxDepth: 5 }),
    );
    expect(result).toHaveLength(5);
  });

  it('is cycle-safe', () => {
    const a: MutableInstance = { _uid: 1, $options: { name: 'A' }, $parent: null };
    const b: MutableInstance = { _uid: 2, $options: { name: 'B' }, $parent: null };
    a.$parent = b;
    b.$parent = a;
    const result = Array.from(walkComponentAncestors(a as Vue2ComponentInstance));
    expect(result).toHaveLength(2);
  });

  it('accepts _componentTag as an identity signal', () => {
    const node: MutableInstance = {
      _uid: 1,
      $options: { _componentTag: 'my-thing' },
      $parent: null,
    };
    const result = Array.from(walkComponentAncestors(node as Vue2ComponentInstance));
    expect(result).toHaveLength(1);
  });
});
