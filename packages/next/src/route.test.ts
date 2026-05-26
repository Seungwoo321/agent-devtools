import { describe, expect, it } from 'vitest';
import { resolveNextAppRouterRouteFile } from './route.js';

describe('resolveNextAppRouterRouteFile', () => {
  it('maps the root path to app/page.tsx', () => {
    expect(resolveNextAppRouterRouteFile('/')).toBe('app/page.tsx');
  });

  it('maps the empty string to app/page.tsx as a defensive default', () => {
    expect(resolveNextAppRouterRouteFile('')).toBe('app/page.tsx');
  });

  it('maps a static one-segment path to app/<segment>/page.tsx', () => {
    expect(resolveNextAppRouterRouteFile('/about')).toBe('app/about/page.tsx');
  });

  it('maps a multi-segment path to the nested app directory', () => {
    expect(resolveNextAppRouterRouteFile('/blog/hello')).toBe('app/blog/hello/page.tsx');
  });

  it('preserves dynamic-looking segments without inferring brackets', () => {
    expect(resolveNextAppRouterRouteFile('/posts/123')).toBe('app/posts/123/page.tsx');
  });

  it('trims a trailing slash before joining the page suffix', () => {
    expect(resolveNextAppRouterRouteFile('/settings/')).toBe('app/settings/page.tsx');
  });

  it('treats a path that is only a trailing slash like the root', () => {
    // Defensive: extractRoute should never hand us this, but cover the
    // branch so a future caller does not get a malformed `app//page.tsx`.
    expect(resolveNextAppRouterRouteFile('/')).toBe('app/page.tsx');
  });

  it('returns undefined when the input is not a string', () => {
    expect(resolveNextAppRouterRouteFile(42 as unknown as string)).toBeUndefined();
  });
});
