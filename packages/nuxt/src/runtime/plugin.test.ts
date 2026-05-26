import { describe, expect, it, vi, beforeEach } from 'vitest';

const mountMock = vi.hoisted(() => vi.fn());

vi.mock('@agent-devtools/vue', () => ({
  mountAgentDevtoolsVue: mountMock,
}));

(globalThis as unknown as { defineNuxtPlugin: (fn: unknown) => unknown }).defineNuxtPlugin = (
  fn: unknown,
) => fn;

describe('runtime/plugin', () => {
  beforeEach(() => {
    mountMock.mockReset();
    vi.resetModules();
  });

  it('mounts the Vue adapter when a document is available', async () => {
    const plugin = (await import('./plugin.js')).default as (app?: unknown) => void;
    plugin({});
    expect(mountMock).toHaveBeenCalledTimes(1);
    const opts = mountMock.mock.calls[0]?.[0] as
      | { resolveRouteFile?: () => string | undefined }
      | undefined;
    expect(typeof opts?.resolveRouteFile).toBe('function');
  });

  it('skips mounting when document is undefined (SSR pass)', async () => {
    const originalDocument = globalThis.document;
    Reflect.deleteProperty(globalThis, 'document');
    try {
      const plugin = (await import('./plugin.js')).default as (app?: unknown) => void;
      plugin({});
      expect(mountMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'document', {
        value: originalDocument,
        writable: true,
        configurable: true,
      });
    }
  });
});

describe('makeRouteFileResolver', () => {
  it("reads __file from the leaf matched route's default component", async () => {
    const { makeRouteFileResolver } = await import('./plugin.js');
    const nuxtApp = {
      $router: {
        currentRoute: {
          value: {
            matched: [
              { components: { default: { __file: 'pages/layout.vue' } } },
              { components: { default: { __file: 'pages/blog/[slug].vue' } } },
            ],
          },
        },
      },
    };
    expect(makeRouteFileResolver(nuxtApp)()).toBe('pages/blog/[slug].vue');
  });

  it('re-reads the router each call so navigation updates routeFile', async () => {
    const { makeRouteFileResolver } = await import('./plugin.js');
    const matched: { components: { default: { __file: string } } }[] = [
      { components: { default: { __file: 'pages/index.vue' } } },
    ];
    const nuxtApp = {
      $router: { currentRoute: { value: { matched } } },
    };
    const resolve = makeRouteFileResolver(nuxtApp);
    expect(resolve()).toBe('pages/index.vue');
    matched.splice(0, matched.length, { components: { default: { __file: 'pages/about.vue' } } });
    expect(resolve()).toBe('pages/about.vue');
  });

  it('returns undefined when no route is matched', async () => {
    const { makeRouteFileResolver } = await import('./plugin.js');
    expect(makeRouteFileResolver({})()).toBeUndefined();
    expect(makeRouteFileResolver({ $router: {} })()).toBeUndefined();
    expect(
      makeRouteFileResolver({
        $router: { currentRoute: { value: { matched: [] } } },
      })(),
    ).toBeUndefined();
  });

  it('returns undefined when the matched record has no __file', async () => {
    const { makeRouteFileResolver } = await import('./plugin.js');
    const nuxtApp = {
      $router: {
        currentRoute: {
          value: { matched: [{ components: { default: {} } }] },
        },
      },
    };
    expect(makeRouteFileResolver(nuxtApp)()).toBeUndefined();
  });
});
