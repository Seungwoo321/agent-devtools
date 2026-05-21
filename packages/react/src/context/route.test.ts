import { describe, expect, it } from 'vitest';
import { extractRoute } from './route.js';

describe('extractRoute', () => {
  it('returns the three components from a Location', () => {
    const loc = {
      pathname: '/settings',
      search: '?tab=profile',
      hash: '#section',
    } as unknown as Location;
    expect(extractRoute(loc)).toEqual({
      pathname: '/settings',
      search: '?tab=profile',
      hash: '#section',
    });
  });

  it('returns empty strings when given undefined', () => {
    expect(extractRoute(undefined)).toEqual({ pathname: '', search: '', hash: '' });
  });

  it('coerces non-string fields to empty strings', () => {
    const loc = {
      pathname: undefined,
      search: undefined,
      hash: undefined,
    } as unknown as Location;
    expect(extractRoute(loc)).toEqual({ pathname: '', search: '', hash: '' });
  });
});
