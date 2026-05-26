---
'@agent-devtools/core': minor
'@agent-devtools/harness-core': minor
'@agent-devtools/widget-core': minor
'@agent-devtools/react': minor
'@agent-devtools/vue': minor
'@agent-devtools/vue2': minor
'@agent-devtools/next': minor
'@agent-devtools/next-pages': minor
'@agent-devtools/nuxt': minor
'@agent-devtools/nuxt2': minor
'@agent-devtools/angular': minor
'@agent-devtools/svelte': minor
'@agent-devtools/sveltekit': minor
'@agent-devtools/vite': minor
---

Release the fixed-mode 0.5.0 line so the npm registry catches up to the
repository state. This bumps Node engines to `>=22.13.0` to match the
pnpm 11.x minimum, ships the new `@agent-devtools/widget-core` package
as the framework-agnostic widget shell, and publishes the first stable
versions of the new adapters: `@agent-devtools/vue2`,
`@agent-devtools/next-pages`, `@agent-devtools/nuxt2`,
`@agent-devtools/angular`, `@agent-devtools/svelte`, and
`@agent-devtools/sveltekit`. Existing packages move onto the same
version line, eliminating the dual-core drift that affected end-user
installs of `@agent-devtools/vite` with older `@agent-devtools/core`
servers.
