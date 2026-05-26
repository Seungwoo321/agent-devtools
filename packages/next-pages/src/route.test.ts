import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveNextPagesRouteFile } from './route.js';

type NextWindow = Window & { next?: { router?: { pathname?: unknown } } };

describe('resolveNextPagesRouteFile', () => {
  beforeEach(() => {
    delete (window as NextWindow).next;
  });

  afterEach(() => {
    delete (window as NextWindow).next;
  });

  it('maps the dynamic-segment pathname to pages/<path> without extension', () => {
    (window as NextWindow).next = { router: { pathname: '/blog/[slug]' } };
    expect(resolveNextPagesRouteFile()).toBe('pages/blog/[slug]');
  });

  it('maps the root path to pages/index', () => {
    (window as NextWindow).next = { router: { pathname: '/' } };
    expect(resolveNextPagesRouteFile()).toBe('pages/index');
  });

  it('returns undefined when window.next is missing', () => {
    expect(resolveNextPagesRouteFile()).toBeUndefined();
  });

  it('returns undefined when next.router is missing', () => {
    (window as NextWindow).next = {};
    expect(resolveNextPagesRouteFile()).toBeUndefined();
  });

  it('returns undefined when pathname is not a string', () => {
    (window as NextWindow).next = { router: { pathname: 42 } };
    expect(resolveNextPagesRouteFile()).toBeUndefined();
  });

  it('returns undefined when pathname is the empty string', () => {
    (window as NextWindow).next = { router: { pathname: '' } };
    expect(resolveNextPagesRouteFile()).toBeUndefined();
  });
});
