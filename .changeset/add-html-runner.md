---
'@agent-devtools/html': minor
---

Add `@agent-devtools/html`, a tiny npx runner that serves a folder of plain HTML through a programmatic Vite dev server with the agent-devtools widget injected. It lets a non-developer launch the floating editing widget on plain HTML with a single command (`npx @agent-devtools/html ./my-pages`) — no framework, no build step, no JS entry required. The runner reuses the existing Vite plugin verbatim and points its `importFrom` at the framework-agnostic `@agent-devtools/widget-core`, so the injected bootstrap mounts the DOM-only widget (every element is pickable; source and component chain are simply omitted when there is no framework owner). The plugin's serve-only application and the widget's runtime `NODE_ENV` guard keep it strictly dev-scoped — there is no production output to leak into.
