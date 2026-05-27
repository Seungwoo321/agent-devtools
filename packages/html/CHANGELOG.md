# @agent-devtools/html

## 1.0.0-beta.1

### Patch Changes

- Updated dependencies []:
  - @agent-devtools/vite@1.0.0-beta.1
  - @agent-devtools/widget-core@1.0.0-beta.1

## 0.7.0-beta.0

### Minor Changes

- [#9](https://github.com/Seungwoo321/agent-devtools/pull/9) [`aedf133`](https://github.com/Seungwoo321/agent-devtools/commit/aedf133ab2ede770c71a2d505eff4dd9ccf76271) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Add `@agent-devtools/html`, a tiny npx runner that serves a folder of plain HTML through a programmatic Vite dev server with the agent-devtools widget injected. It lets a non-developer launch the floating editing widget on plain HTML with a single command (`npx @agent-devtools/html ./my-pages`) — no framework, no build step, no JS entry required. The runner reuses the existing Vite plugin verbatim and points its `importFrom` at the framework-agnostic `@agent-devtools/widget-core`, so the injected bootstrap mounts the DOM-only widget (every element is pickable; source and component chain are simply omitted when there is no framework owner). The plugin's serve-only application and the widget's runtime `NODE_ENV` guard keep it strictly dev-scoped — there is no production output to leak into.

### Patch Changes

- Updated dependencies []:
  - @agent-devtools/vite@0.7.0-beta.0
  - @agent-devtools/widget-core@0.7.0-beta.0
