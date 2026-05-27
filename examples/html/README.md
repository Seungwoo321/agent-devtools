# example-html

Plain HTML (no framework, no JS entry) served by
[`@agent-devtools/html`](../../packages/html). Demonstrates that the runner
injects the dev-only widget into every served page and that nothing leaks into
the source files.

## Run it

```bash
pnpm --filter @agent-devtools/example-html dev
# → http://127.0.0.1:3210/
```

Open the URL, pick any element (the picker resolves plain elements in DOM-only
mode — `outerHTML`, selector, `tagName`, `id`, `class`, text), and describe a
change. The agent edits the HTML files in this folder.

## Checks

```bash
# dev-injection: boot the runner, assert the bootstrap was injected
pnpm --filter @agent-devtools/example-html smoke

# no-leak: assert no widget-chain symbol is baked into the source HTML
pnpm --filter @agent-devtools/example-html smoke:no-leak
```

The repository-wide `pnpm smoke:integration` also boots this example's `dev`
server and asserts the injection over HTTP, alongside every framework adapter.
