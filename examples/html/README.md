[English] · [한국어](./README.ko.md)

# @agent-devtools/example-html

End-to-end smoke for `@agent-devtools/html`. Plain static HTML (no framework, no JS entry) served by the `agent-devtools-html` runner, which injects the dev-only widget into every served page.

## Layout

- `index.html` — root page (`Acme Planner · Home`). Static markup; pick any element and the picker resolves it in DOM-only mode (`outerHTML`, selector, `tagName`, `id`, `class`, text).
- `about.html` — second page proving the runner injects the widget into every served file, not just the index.
- `package.json` — the `dev` script runs `agent-devtools-html . --port 3210`; there is no bundler plugin because there is no build step.

## Run

```bash
pnpm install
pnpm --filter @agent-devtools/example-html dev
```

The dev server listens on `http://127.0.0.1:3210/`. Open the URL, pick any element, and describe a change — the agent edits the HTML files in this folder directly.

## Production no-leak smoke

```bash
pnpm --filter @agent-devtools/example-html smoke
pnpm --filter @agent-devtools/example-html smoke:no-leak
```

`smoke` boots the runner and asserts the bootstrap script tag was injected over HTTP. `smoke:no-leak` (also run via `build:check`) asserts no widget-chain identifier (`mountAgentDevtools`, `createDefaultTransport`, `@agent-devtools`, `__AGENT_DEVTOOLS_CONFIG__`) is baked into the source HTML — the widget exists only in the runner's injected response, never on disk. The repository-wide `pnpm smoke:integration` also boots this example's `dev` server and asserts the injection over HTTP, alongside every framework adapter.
