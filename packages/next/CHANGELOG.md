# @agent-devtools/next

## 1.3.0

### Patch Changes

- Updated dependencies [[`3aaa7d3`](https://github.com/Seungwoo321/agent-devtools/commit/3aaa7d39fbfe0afcc678b53940f592f59b666e9a)]:
  - @agent-devtools/core@1.3.0
  - @agent-devtools/react@1.3.0

## 1.3.0-beta.0

### Patch Changes

- Updated dependencies [[`3aaa7d3`](https://github.com/Seungwoo321/agent-devtools/commit/3aaa7d39fbfe0afcc678b53940f592f59b666e9a)]:
  - @agent-devtools/core@1.3.0-beta.0
  - @agent-devtools/react@1.3.0-beta.0

## 1.2.1

### Patch Changes

- Updated dependencies [[`19b1d2b`](https://github.com/Seungwoo321/agent-devtools/commit/19b1d2bb438c522f0135f17b3ab5eb671002a020)]:
  - @agent-devtools/react@1.2.1
  - @agent-devtools/core@1.2.1

## 1.2.1-beta.0

### Patch Changes

- Updated dependencies [[`19b1d2b`](https://github.com/Seungwoo321/agent-devtools/commit/19b1d2bb438c522f0135f17b3ab5eb671002a020)]:
  - @agent-devtools/react@1.2.1-beta.0
  - @agent-devtools/core@1.2.1-beta.0

## 1.2.0

### Patch Changes

- Updated dependencies []:
  - @agent-devtools/react@1.2.0
  - @agent-devtools/core@1.2.0

## 1.2.0-beta.0

### Patch Changes

- Updated dependencies []:
  - @agent-devtools/core@1.2.0-beta.0
  - @agent-devtools/react@1.2.0-beta.0

## 1.1.0

### Patch Changes

- Updated dependencies [[`4cdbe4b`](https://github.com/Seungwoo321/agent-devtools/commit/4cdbe4b2e2103c015dd8fda2278ce683c1ece0a5), [`6317aa3`](https://github.com/Seungwoo321/agent-devtools/commit/6317aa3fdc501738aa89fcae6a660384e3f7bc15)]:
  - @agent-devtools/core@1.1.0
  - @agent-devtools/react@1.1.0

## 1.1.0-beta.0

### Patch Changes

- Updated dependencies [[`4cdbe4b`](https://github.com/Seungwoo321/agent-devtools/commit/4cdbe4b2e2103c015dd8fda2278ce683c1ece0a5), [`6317aa3`](https://github.com/Seungwoo321/agent-devtools/commit/6317aa3fdc501738aa89fcae6a660384e3f7bc15)]:
  - @agent-devtools/core@1.1.0-beta.0
  - @agent-devtools/react@1.1.0-beta.0

## 1.0.0

### Patch Changes

- Updated dependencies [[`9e0acd0`](https://github.com/Seungwoo321/agent-devtools/commit/9e0acd0213161d04437d3f990c9ad6bf1a756cb1)]:
  - @agent-devtools/core@1.0.0
  - @agent-devtools/react@1.0.0

## 1.0.0-beta.1

### Patch Changes

- Updated dependencies [[`9e0acd0`](https://github.com/Seungwoo321/agent-devtools/commit/9e0acd0213161d04437d3f990c9ad6bf1a756cb1)]:
  - @agent-devtools/core@1.0.0-beta.1
  - @agent-devtools/react@1.0.0-beta.1

## 0.7.0-beta.0

### Patch Changes

- Updated dependencies []:
  - @agent-devtools/core@0.7.0-beta.0
  - @agent-devtools/react@0.7.0-beta.0

## 0.6.0

### Minor Changes

- [#8](https://github.com/Seungwoo321/agent-devtools/pull/8) [`a7e5ed5`](https://github.com/Seungwoo321/agent-devtools/commit/a7e5ed5fec27895545f511e21f0b9f0f7a51488b) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Publish the resumable handoff flow and per-action permission controls that
  landed on the repository after the 0.5.0 release. The terminal handoff modal
  now offers a `claude --resume <session>` command beside the append system
  prompt file, resolved from the client session through the ACP session store.
  The agent runtime gates file edits, shell, web fetch, and MCP tool calls
  through an action-aware permission policy instead of a single mode switch.
  The Vite plugin hardens its enrichment endpoints and ships safer defaults,
  the launcher gains visibility controls, and the picked-context preamble and
  stream renderer carry richer evidence and pending placeholders. These
  changes were merged but never reached npm because the merging pull request
  carried no changeset; this changeset closes that gap.

### Patch Changes

- Updated dependencies [[`a7e5ed5`](https://github.com/Seungwoo321/agent-devtools/commit/a7e5ed5fec27895545f511e21f0b9f0f7a51488b)]:
  - @agent-devtools/core@0.6.0
  - @agent-devtools/react@0.6.0

## 0.5.0

### Minor Changes

- [#6](https://github.com/Seungwoo321/agent-devtools/pull/6) [`19bd25a`](https://github.com/Seungwoo321/agent-devtools/commit/19bd25acb4a4470d56a5c313e01edbe75ee329bb) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Release the fixed-mode 0.5.0 line so the npm registry catches up to the
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

### Patch Changes

- Updated dependencies [[`19bd25a`](https://github.com/Seungwoo321/agent-devtools/commit/19bd25acb4a4470d56a5c313e01edbe75ee329bb)]:
  - @agent-devtools/core@0.5.0
  - @agent-devtools/react@0.5.0
