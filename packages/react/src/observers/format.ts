/**
 * Best-effort serializer for the heterogeneous arguments passed to
 * `console.error(...)`. Real apps log Errors, plain strings, React error
 * objects with `componentStack`, axios error responses, and raw DOM events.
 * We try to preserve readable info without crashing on cycles, BigInts,
 * Symbols, or `Object.create(null)`.
 */

const MAX_DEPTH = 3;
const MAX_LEN = 800;

export function formatArgs(args: readonly unknown[]): string {
  return args.map((arg) => formatOne(arg, 0)).join(' ');
}

export function extractStack(args: readonly unknown[]): string | undefined {
  for (const arg of args) {
    if (arg instanceof Error && typeof arg.stack === 'string' && arg.stack.length > 0) {
      return arg.stack;
    }
  }
  return undefined;
}

function formatOne(value: unknown, depth: number): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  const type = typeof value;
  if (type === 'string') return truncate(value as string);
  if (type === 'number' || type === 'boolean' || type === 'bigint') return String(value);
  if (type === 'symbol') return (value as symbol).toString();
  if (type === 'function') {
    const name = (value as { name?: string }).name;
    return name ? `[Function ${name}]` : '[Function]';
  }
  if (depth >= MAX_DEPTH) return '[Object]';
  try {
    const serialized = JSON.stringify(value, replacer());
    if (serialized === undefined) return '[Object]';
    return truncate(serialized);
  } catch {
    return '[Object]';
  }
}

function replacer(): (key: string, val: unknown) => unknown {
  const seen = new WeakSet<object>();
  return function replace(_key: string, val: unknown): unknown {
    if (val === null || typeof val !== 'object') {
      if (typeof val === 'bigint') return val.toString();
      if (typeof val === 'function') return '[Function]';
      return val;
    }
    if (seen.has(val)) return '[Circular]';
    seen.add(val);
    return val;
  };
}

function truncate(s: string): string {
  return s.length <= MAX_LEN ? s : s.slice(0, MAX_LEN) + '…';
}
