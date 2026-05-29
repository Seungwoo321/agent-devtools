# @agent-devtools/html

## 1.2.0-beta.0

### Minor Changes

- [`798bc84`](https://github.com/Seungwoo321/agent-devtools/commit/798bc84c8377fa374c8b1ae697591d8c744bf595) Thanks [@Seungwoo321](https://github.com/Seungwoo321)! - Accept a single `.html` / `.htm` file as the CLI's positional argument, not
  just a folder. Previously the runner could only serve a directory whose root
  URL fell back to `index.html`, which forced the user to either rename their
  sketched file or know to navigate to it manually. Now passing a file path
  makes the runner serve the file's parent directory as the Vite root and
  suffix the printed local URL with the file's basename, so the user lands on
  that page directly.

  The folder branch is unchanged — pointing at a directory still serves every
  `*.html` underneath via Vite's MPA mode, with the root URL resolving to
  `index.html` when present. Extension matching is case-insensitive
  (`./PAGE.HTML` works) and symlinks are followed. Paths that do not exist or
  files with non-HTML extensions fail fast with a one-line error pointing at
  the offending path before the dev server boots.

  Two small public-API additions on the package's programmatic entry support
  the same auto-detection from embedder code:
  - `resolveEntry(rawPath, cwd?)` — inspects a raw positional argument and
    returns `{ root, entryFile }` ready to pass straight into `runHtmlServer`.
  - `runHtmlServer({ entryFile })` — new optional field, suffixed onto the
    printed URL so a programmatic caller can land on a specific page without
    reimplementing URL composition.

### Patch Changes

- Updated dependencies []:
  - @agent-devtools/vite@1.2.0-beta.0
  - @agent-devtools/widget-core@1.2.0-beta.0

## 1.1.0

### Patch Changes

- Updated dependencies [[`4cdbe4b`](https://github.com/Seungwoo321/agent-devtools/commit/4cdbe4b2e2103c015dd8fda2278ce683c1ece0a5), [`b621331`](https://github.com/Seungwoo321/agent-devtools/commit/b621331110dac125484d223b0e9aee3b82ab052d), [`cd230a6`](https://github.com/Seungwoo321/agent-devtools/commit/cd230a6de9ce4ac267ef18446edaea75bc56ddd2), [`3fbaf3b`](https://github.com/Seungwoo321/agent-devtools/commit/3fbaf3b611760793a2932955f4a5ebd70f3bb70b), [`3fbaf3b`](https://github.com/Seungwoo321/agent-devtools/commit/3fbaf3b611760793a2932955f4a5ebd70f3bb70b)]:
  - @agent-devtools/widget-core@1.1.0
  - @agent-devtools/vite@1.1.0

## 1.1.0-beta.0

### Patch Changes

- Updated dependencies [[`4cdbe4b`](https://github.com/Seungwoo321/agent-devtools/commit/4cdbe4b2e2103c015dd8fda2278ce683c1ece0a5), [`b621331`](https://github.com/Seungwoo321/agent-devtools/commit/b621331110dac125484d223b0e9aee3b82ab052d), [`cd230a6`](https://github.com/Seungwoo321/agent-devtools/commit/cd230a6de9ce4ac267ef18446edaea75bc56ddd2), [`3fbaf3b`](https://github.com/Seungwoo321/agent-devtools/commit/3fbaf3b611760793a2932955f4a5ebd70f3bb70b), [`3fbaf3b`](https://github.com/Seungwoo321/agent-devtools/commit/3fbaf3b611760793a2932955f4a5ebd70f3bb70b)]:
  - @agent-devtools/widget-core@1.1.0-beta.0
  - @agent-devtools/vite@1.1.0-beta.0

## 1.0.0

### Patch Changes

- Updated dependencies []:
  - @agent-devtools/vite@1.0.0
  - @agent-devtools/widget-core@1.0.0

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
