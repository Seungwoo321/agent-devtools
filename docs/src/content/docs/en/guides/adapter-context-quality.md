---
title: Adapter context quality
description: For each framework adapter, what walker strategy it uses, how it resolves the source location, whether it carries route awareness, and which other adapters it reuses.
---

agent-devtools ships an adapter per host stack. Every adapter speaks the same
public contract (the [`PickedEvidence`](./widget/) shape and the `mount`
entry), but the **context quality** the widget gets to feed your prompt
varies — because each framework exposes a different runtime tree and a
different amount of compile-time debug metadata.

This page reads each shipped adapter against four axes:

- **Walker** — how the adapter bridges a DOM element to the framework's
  component instance, and how it walks up the tree.
- **Source resolution** — how the adapter turns a component instance into
  a workspace-relative `{ fileName, lineNumber }`. Absence is preferred
  over a guess — see the [picker-coverage rule][rule-coverage].
- **Route awareness** — whether the adapter can tell the agent which route
  the user is currently on (helps the agent grep `app/`, `pages/`, or
  `src/routes/`).
- **Reused adapters** — which other adapter packages it depends on
  through `workspace:*`, so you know what gets re-exported.

For the canonical contract that every adapter walker has to satisfy, see
[`.claude/rules/picker-strategy.md`][rule-strategy]. The three coverage
cases (named component / unnamed host node / pure DOM node) live in
[`.claude/rules/picker-coverage.md`][rule-coverage], and the package shape
contract is in [`.claude/rules/adapter-discipline.md`][rule-discipline].

## react — `@agent-devtools/react`

| Axis            | Reality                                                                                                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Walker          | Fiber walker. DOM ↔ fiber bridge via the element's own property `__reactFiber$<nonce>` (also `__reactContainer$<nonce>` for the root). Ancestors come from the fiber's `.return` chain, leaf-first, host fibers skipped, max depth 10.                                         |
| Source          | React ≤ 18: `fiber._debugSource` if present. React 19: `_debugSource` is gone — the resolver parses the JSX call site out of `fiber._debugStack.stack` with a V8-grammar parser. Path is normalised to workspace-relative (strips Vite's `?t=` cache bust and `/@fs/` prefix). |
| Route awareness | None. React itself does not own routing.                                                                                                                                                                                                                                       |
| Reused adapters | None. This is the base React adapter that every other React-family adapter reuses.                                                                                                                                                                                             |

## next — `@agent-devtools/next`

| Axis            | Reality                                                                                                                                                                                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walker          | The React fiber walker, reused verbatim. Next 15 client components render through the same React fiber tree, so `@agent-devtools/next` re-exports `mountAgentDevtools` from `@agent-devtools/react` and adds App-Router-specific bootstrap helpers (`withAgentDevtools`, `bootstrapAgentDevtools`). |
| Source          | The React path. Server components themselves do not surface in the client fiber tree, so picks on RSC-emitted markup degrade to host-DOM-only evidence (selector + outerHTML + tagName). No fake source is emitted — see the [picker-coverage rule][rule-coverage].                                 |
| Route awareness | App Router route helpers planned. Today the adapter does not extract `app/`-style route files from the picked element; the agent can still infer the route from the URL and the App Router conventions.                                                                                             |
| Reused adapters | `@agent-devtools/react` (workspace dependency, re-exports the React picker + mount).                                                                                                                                                                                                                |

## next-pages — `@agent-devtools/next-pages`

| Axis            | Reality                                                                                                                                                                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walker          | The React fiber walker, reused verbatim. Pages Router components are plain React client components, so the picker + walker come from `@agent-devtools/react`. The adapter adds `pages/_app.tsx` bootstrap helpers, a `withAgentDevtools` `next.config` wrapper, and a Layer-2 NODE_ENV runtime guard. |
| Source          | The React path.                                                                                                                                                                                                                                                                                       |
| Route awareness | Yes — `resolveNextPagesRouteFile()` reads `window.next.router.pathname` (the dynamic-segment form like `/blog/[slug]`) and returns `pages${pathname}` without an extension, because the route can resolve to `.tsx`/`.jsx`/`.ts`/`.js`/`.mdx`/`.md`. The agent greps `pages${pathname}.*` from there. |
| Reused adapters | `@agent-devtools/react`.                                                                                                                                                                                                                                                                              |

## nuxt — `@agent-devtools/nuxt`

| Axis            | Reality                                                                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walker          | The Vue 3 vnode walker, reused verbatim. The Nuxt 3 module's only responsibility is build-time wiring (a `defineNuxtModule` setup that registers a client-only plugin in dev, no-ops in production). The picker, walker, and mount come from `@agent-devtools/vue`. |
| Source          | The Vue 3 path — `__file` from `@vitejs/plugin-vue` with `lineNumber: 1` (Vue's runtime does not preserve per-tag line numbers).                                                                                                                                    |
| Route awareness | Not yet wired through the adapter. The Nuxt runtime exposes `useRoute()` / `window.__NUXT__`, but the picker does not currently attach route info to `PickedEvidence`.                                                                                              |
| Reused adapters | `@agent-devtools/vue` (workspace dependency, re-exports `mountAgentDevtools` as `mountAgentDevtoolsVue`) plus `@agent-devtools/widget-core` for the transport helpers.                                                                                              |

## nuxt2 — `@agent-devtools/nuxt2`

| Axis            | Reality                                                                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walker          | The Vue 2 walker, reused verbatim. Nuxt 2 modules predate `@nuxt/kit`, so the adapter duck-types `addPlugin` on the `ModuleContainer` `this` binding and registers a client-only runtime plugin in dev. Picker, walker, and mount come from `@agent-devtools/vue2`. |
| Source          | The Vue 2 path — `$options.__file` from `vite-plugin-vue2` / `vue-template-compiler` with `lineNumber: 1`.                                                                                                                                                          |
| Route awareness | Not wired. Same posture as nuxt3 — `$route` is reachable from the Vue 2 instance but the adapter does not attach route info to `PickedEvidence` today.                                                                                                              |
| Reused adapters | `@agent-devtools/vue2` (workspace dependency, re-exports `mountAgentDevtools` as `mountAgentDevtoolsVue2`) plus `@agent-devtools/widget-core` for the transport helpers.                                                                                            |

## vue — `@agent-devtools/vue`

| Axis            | Reality                                                                                                                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walker          | Vnode walker. DOM ↔ component instance bridge via the non-enumerable property `__vueParentComponent`, which Vue 3.2+ sets on every rendered host node. Ancestors come from the instance's `.parent` chain.                                                      |
| Source          | `instance.type.__file` (absolute path, injected by `@vitejs/plugin-vue` in dev). Path is normalised to a workspace-relative form. `lineNumber` is `1` deliberately — Vue's SFC compiler does not preserve per-tag line numbers on the runtime component object. |
| Route awareness | None at the adapter level. Vue Router is optional and project-specific; route attachment is a host-side concern.                                                                                                                                                |
| Reused adapters | None. This is the base Vue 3 adapter that Nuxt 3 reuses.                                                                                                                                                                                                        |

## vue2 — `@agent-devtools/vue2`

| Axis            | Reality                                                                                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Walker          | Vnode walker. Vue 2 only stamps the **root** DOM node of each component with `__vue__`, so the bridge walks `parentElement` upwards until it finds the first element that owns an instance. Ancestors come from the instance's `.$parent` chain. |
| Source          | `instance.$options.__file` (absolute path, injected by `vite-plugin-vue2` or `vue-template-compiler`). Path is normalised to workspace-relative; `lineNumber` is `1` (Vue 2's compiler does not preserve per-tag line numbers).                  |
| Route awareness | None at the adapter level.                                                                                                                                                                                                                       |
| Reused adapters | None. This is the base Vue 2 adapter that Nuxt 2 reuses.                                                                                                                                                                                         |

## svelte — `@agent-devtools/svelte`

| Axis            | Reality                                                                                                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walker          | Element-keyed walker. The Svelte compiler attaches `__svelte_meta` on every element it renders in dev mode. The walker reads that meta and groups sibling elements that share the same source file into a single component ancestor entry, leaf-first.         |
| Source          | Read from `__svelte_meta.loc` (`{ file, line, column }`). Both Svelte 4 and Svelte 5 use the same property name `__svelte_meta` — there is no separate `_svelte_meta` field. Path is normalised (strips `?t=…` cache bust, `/@fs/` prefix, decodes `file://`). |
| Route awareness | None at the adapter level. Route detection is a SvelteKit concern (see below).                                                                                                                                                                                 |
| Reused adapters | None other than `@agent-devtools/widget-core` for shared transport helpers. The Svelte adapter is self-contained.                                                                                                                                              |

## sveltekit — `@agent-devtools/sveltekit`

| Axis            | Reality                                                                                                                                                                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walker          | The Svelte walker, reused verbatim. The SvelteKit adapter re-exports `mountAgentDevtoolsSvelte` as `mountAgentDevtoolsSvelteKit`, plus the walker, the picker, the source resolver, and the component-name helper from `@agent-devtools/svelte`.                                                         |
| Source          | The Svelte path (`__svelte_meta.loc`).                                                                                                                                                                                                                                                                   |
| Route awareness | Scaffolded but identity-passthrough today. `createAgentDevtoolsHandle()` ships from `@agent-devtools/sveltekit/hooks` for `src/hooks.server.ts`; Phase 0 returns the request unmodified. Future milestones will thread the pairing token through `event.locals` and emit bootstrap config for SSR pages. |
| Reused adapters | `@agent-devtools/svelte` (workspace dependency, re-exports the Svelte picker + mount).                                                                                                                                                                                                                   |

## angular — `@agent-devtools/angular`

| Axis            | Reality                                                                                                                                                                                                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walker          | Ivy debug-API walker. The bridge prefers `window.ng.getOwningComponent(element)` and falls back to `window.ng.getComponent(element)` — both are dev-only Ivy globals that disappear under `enableProdMode()`. Ancestors come from the component instance's parent chain through Angular's internal debug data.         |
| Source          | Returns `undefined` today. Angular's template compiler does not emit `__source` props the way React's JSX dev transform does, and the runtime exposes no file-level metadata for component classes. The picker still emits component name, selector, outerHTML, and tagName, so the agent can grep for the class name. |
| Route awareness | None.                                                                                                                                                                                                                                                                                                                  |
| Reused adapters | None. Self-contained Ivy walker + closed-shadow widget.                                                                                                                                                                                                                                                                |

## How this maps onto the three coverage cases

For every adapter, the picker never rejects an element. It always returns
`PickedEvidence` and fills only the fields the walker could resolve.
See the [picker-coverage rule][rule-coverage] for the canonical
description of:

- **Case A** — named component fully resolved (walker + source both succeed)
- **Case B** — host fiber/vnode resolved but no named component (chip label
  falls back to the lowercase tag)
- **Case C** — no walker hit at all (pure host node, third-party widget,
  another framework's DOM) → `{ tagName, selector, outerHTML }` only

Adapters that currently cannot extract source (angular today, RSC-only
picks under next) will always land somewhere between Case B and Case C
regardless of how rich the rest of the tree is. The trade-off is
deliberate: a wrong `fileName` would make the agent edit an unrelated
file. Absence is recoverable through `outerHTML` + `selector`; a wrong
location is not.

## See also

- [`.claude/rules/picker-strategy.md`][rule-strategy] — the canonical
  per-framework walker contract.
- [`.claude/rules/picker-coverage.md`][rule-coverage] — the three
  coverage cases and the "pick anything" decision record.
- [`.claude/rules/adapter-discipline.md`][rule-discipline] — the package
  shape every `@agent-devtools/<framework>` adapter has to satisfy.
- [How it works](./how-it-works/) — the end-to-end loop diagram.
- [Widget & page context](./widget/) — what `PickedEvidence` looks like
  in the chat composer.

[rule-strategy]: https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/picker-strategy.md
[rule-coverage]: https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/picker-coverage.md
[rule-discipline]: https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/adapter-discipline.md
