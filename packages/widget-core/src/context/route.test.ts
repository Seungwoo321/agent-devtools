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

  it('populates routeFile when the resolver returns a path', () => {
    const loc = {
      pathname: '/blog/hello',
      search: '',
      hash: '',
    } as unknown as Location;
    const result = extractRoute(loc, (pathname) =>
      pathname.startsWith('/blog/') ? 'pages/blog/[slug].tsx' : undefined,
    );
    expect(result.routeFile).toBe('pages/blog/[slug].tsx');
  });

  it('omits routeFile when the resolver returns undefined', () => {
    const loc = {
      pathname: '/unknown',
      search: '',
      hash: '',
    } as unknown as Location;
    const result = extractRoute(loc, () => undefined);
    expect(result.routeFile).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(result, 'routeFile')).toBe(false);
  });

  it('omits routeFile when no resolver is supplied', () => {
    const loc = { pathname: '/x', search: '', hash: '' } as unknown as Location;
    const result = extractRoute(loc);
    expect(result.routeFile).toBeUndefined();
  });
});
