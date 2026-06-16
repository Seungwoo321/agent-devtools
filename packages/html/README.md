[English] · [한국어](./README.ko.md)

# @agent-devtools/html

> A one-command runner that serves **plain HTML** with the [agent-devtools](https://github.com/Seungwoo321/agent-devtools) floating widget injected. No framework, no bundler config, no LLM API key wiring.

[![npm](https://img.shields.io/npm/v/@agent-devtools/html.svg)](https://www.npmjs.com/package/@agent-devtools/html)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

> Dev-only. The runner boots a programmatic Vite dev server and injects the widget into served HTML; nothing is written to your files. The `@agent-devtools/vite` plugin's `apply: 'serve'` plus the widget's runtime `NODE_ENV` guard keep it strictly dev-scoped — see [`dev-only-guard`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md).

Ideal for handing the in-page agent to a teammate (e.g. a planner sketching pages through Claude Code) who is editing static HTML.

```bash
# Serve a folder of HTML files (root URL → index.html when present)
npx @agent-devtools/html ./my-pages

# Or point at a single .html / .htm file and land directly on it
npx @agent-devtools/html ./my-pages/about.html
```

Open the printed `http://127.0.0.1:…` URL, pick any element with the widget, and describe the change in natural language. The agent edits the HTML files in the served folder.

## Features

- **Zero-config runner** — boots a programmatic [Vite](https://vite.dev) dev server against your folder and registers the existing [`@agent-devtools/vite`](../vite) plugin with its `importFrom` pointed at [`@agent-devtools/widget-core`](../widget-core), the framework-agnostic widget. The plugin handles HTML injection, the same-origin proxy, the pairing token, and the production guard exactly as it does for the framework adapters.
- **Reuses your Claude Code session** — the spawned [`@agent-devtools/core`](../core) server reaches your already-running Claude Code through its ACP provider, reusing your `~/.claude` session — no extra credentials.
- **DOM-only picker** — because there is no framework owner, every element is pickable and the agent receives its `outerHTML`, a unique CSS selector, `tagName`, `id`, `class`, and text. Source file / component chain are simply omitted (there is nothing to resolve), which the agent compensates for by grepping the markup.
- **Folder or single-file** — serve a whole folder (MPA mode, every `*.html` is served directly) or a single `.html` / `.htm` file, in which case its parent directory becomes the served workspace and the printed URL points at the file.
- **Safer than a CDN `<script>`** — the widget is injected by a local dev server and never written into your HTML files, so it cannot end up on a public site. The agent server binds to `127.0.0.1` only and its pairing token lives in memory (never on disk, never in the URL).

## Install

For the smoothest `npx` experience, install it as a dev dependency first so the widget resolves from your project's `node_modules`:

```bash
npm i -D @agent-devtools/html
npx agent-devtools-html ./pages
```

Or run it ad-hoc with bare `npx @agent-devtools/html` — no install required.

## Usage

```bash
# serve the current directory (root URL → index.html when present)
npx @agent-devtools/html

# serve a specific folder on a fixed port
npx @agent-devtools/html ./pages --port 3210

# serve a single file directly — its parent directory becomes the served
# folder and the printed URL points at the file (e.g. /about.html)
npx @agent-devtools/html ./pages/about.html
```

| Option          | Description                                                               |
| --------------- | ------------------------------------------------------------------------- |
| `[path]`        | Folder of HTML files **or** a single `.html` / `.htm` file (default: cwd) |
| `--port <n>`    | Preferred port (Vite picks the next free one if taken)                    |
| `--open-shadow` | Mount the widget with an open shadow root (debugging)                     |
| `-h, --help`    | Show help                                                                 |

When the positional argument is a single file, its **parent directory** is served as the workspace (so sibling assets resolve normally) and the printed URL is suffixed with the file's basename. The file does not need to be named `index.html`.

### Programmatic API

```ts
import { runHtmlServer } from '@agent-devtools/html';

// Folder form
const { server, url } = await runHtmlServer({ root: './pages', port: 3210 });
console.log(`serving ${url}`);
// later: await server.close();

// Single-file form — pass the parent directory as `root` and the basename
// as `entryFile` so the printed URL lands directly on that page.
const direct = await runHtmlServer({
  root: './pages',
  entryFile: 'about.html',
});
console.log(`serving ${direct.url}`); // → http://127.0.0.1:<port>/about.html
```

For the CLI's `path` argument (which auto-detects file vs folder), use `resolveEntry`:

```ts
import { resolveEntry, runHtmlServer } from '@agent-devtools/html';

const resolved = resolveEntry(process.argv[2] ?? '.');
await runHtmlServer({
  root: resolved.root,
  ...(resolved.entryFile !== null && { entryFile: resolved.entryFile }),
});
```

## Status

Published as part of the fixed-mode `@agent-devtools/*` release line. The runner reuses the `@agent-devtools/vite` plugin and `@agent-devtools/widget-core` verbatim — see `packages/html/src/**/*.test.ts` for the verified surface.

## License

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
