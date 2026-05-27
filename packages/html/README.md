# @agent-devtools/html

A one-command runner that serves a folder of **plain HTML** with the
[agent-devtools](https://github.com/Seungwoo321/agent-devtools) floating
widget injected. No framework, no bundler config, no LLM API key wiring —
ideal for handing the in-page agent to a teammate (e.g. a planner sketching
pages through Claude Code) who is editing static HTML.

```bash
npx @agent-devtools/html ./my-pages
```

Open the printed `http://127.0.0.1:…` URL, pick any element with the widget,
and describe the change in natural language. The agent edits the HTML files
in that folder.

## Why this and not a CDN `<script>`

The widget is **dev-only by design**. It is injected by a local dev server and
is never written into your HTML files, so it cannot end up on a public site.
The agent server binds to `127.0.0.1` only and its pairing token lives in
memory (never on disk, never in the URL). That makes this a safer way to share
the tool internally than a CDN tag, which could be abused once public.

## How it works

It boots a programmatic [Vite](https://vite.dev) dev server against your folder
and registers the existing [`@agent-devtools/vite`](../vite) plugin with its
`importFrom` pointed at [`@agent-devtools/widget-core`](../widget-core) — the
framework-agnostic widget. The plugin handles HTML injection, the same-origin
proxy, the pairing token, and the production guard exactly as it does for the
framework adapters. The spawned [`@agent-devtools/core`](../core) server reaches
your already-running Claude Code through its ACP provider, reusing your
`~/.claude` session — no extra credentials.

Because there is no framework owner, the element picker runs in DOM-only mode:
every element is pickable and the agent receives its `outerHTML`, a unique CSS
selector, `tagName`, `id`, `class`, and text. Source file / component chain are
simply omitted (there is nothing to resolve), which the agent compensates for
by grepping the markup.

## Usage

```bash
# serve the current directory
npx @agent-devtools/html

# serve a specific folder on a fixed port
npx @agent-devtools/html ./pages --port 3210
```

| Option          | Description                                            |
| --------------- | ------------------------------------------------------ |
| `[folder]`      | Folder of HTML files to serve (default: cwd)           |
| `--port <n>`    | Preferred port (Vite picks the next free one if taken) |
| `--open-shadow` | Mount the widget with an open shadow root (debugging)  |
| `-h, --help`    | Show help                                              |

For the smoothest `npx` experience, install it as a dev dependency first so the
widget resolves from your project's `node_modules`:

```bash
npm i -D @agent-devtools/html
npx agent-devtools-html ./pages
```

## Programmatic API

```ts
import { runHtmlServer } from '@agent-devtools/html';

const { server, url } = await runHtmlServer({ root: './pages', port: 3210 });
console.log(`serving ${url}`);
// later: await server.close();
```

## License

MIT
