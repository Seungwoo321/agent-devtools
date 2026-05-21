# Manual smoke-test scenarios — `examples/react-vite`

Five end-to-end scenarios that exercise the widget against the example app.
Run them in order; each builds on what the previous ones verified.

These are **manual** scenarios — a human runs them in a real browser. The
intent is to cover the user paths a Playwright suite will later automate
(U9 integration verification, gated behind every other unit being done).

## Setup (run once per session)

```bash
pnpm install
pnpm --filter @agent-devtools/core build
pnpm --filter @agent-devtools/react build
pnpm --filter @agent-devtools/vite build
pnpm --filter @agent-devtools/example-react-vite dev
```

Open the URL Vite prints (typically `http://localhost:5173/`).

You should see three cards (Counter / Users / Profile) and a launcher
button in the lower-right of the viewport. Open DevTools → Network tab
and filter for `127.0.0.1`; you'll see the agent server's pairing token
travel only in the `Authorization: Bearer …` header — never the URL.

---

## Scenario 1 — Launcher opens and closes the composer

**Goal:** confirm the widget mounts inside a shadow root and the launcher
toggles the composer panel without leaking styles into the host page.

1. Click the launcher button in the bottom-right corner.
2. **Expect:** a composer panel slides in with a textarea, a "Pick"
   button, a close (×) button, and a stream area above the textarea.
3. Click the launcher again.
4. **Expect:** the panel hides (does not unmount — re-opening preserves
   any text the user already typed).
5. Open the composer's close (×) button.
6. **Expect:** the panel hides, same as the launcher toggle.

**Pass/fail signal:** the page's own styles (background, fonts, table
borders) are unaffected when the widget opens. Inspect the launcher
element — it must be inside a `<div>` with a `#shadow-root (open)`
child. No global CSS reset from the widget reaches the host body.

**Where this gets fixed if it breaks:** `packages/react/src/widget/`
(shadow root creation), `packages/react/src/launcher/`,
`packages/react/src/composer/`.

---

## Scenario 2 — Picker captures a component and populates the chip

**Goal:** confirm the picker resolves a click to the right DOM node and
that the React fiber walker extracts a useful component name.

1. Open the composer.
2. Click "Pick".
3. **Expect:** the composer hides; the cursor changes to a crosshair (or
   equivalent picker overlay); a hover outline tracks elements under the
   pointer.
4. Click a row inside the **Users** table — pick a single `<tr>`.
5. **Expect:** the composer reappears with a chip showing a label like
   "UserRow" or "tr"; the chip is removable via its × button.
6. Click "Pick" again and pick the **Counter**'s `<button>+1</button>`.
7. **Expect:** the chip updates to "Counter" or "button".
8. Press Escape during a pick session.
9. **Expect:** the picker cancels; the composer reopens with no chip
   change.

**Pass/fail signal:** the chip's label must reflect the React component
where possible (not just the tag name). If you always see the tag name,
the fiber walker isn't finding component owners.

**Where this gets fixed:** `packages/react/src/picker/`,
`packages/react/src/context/picked.ts` (descriptor builder),
`packages/react/src/context/fiber-walker.ts`.

---

## Scenario 3 — Submitting a prompt sends to the agent server

**Goal:** confirm the SSE transport correctly POSTs to
`/v1/agent/stream` with the Bearer pairing token, receives the auth
response, and surfaces it through the message store into the rendered
stream.

The example app does **not** wire a real agent factory into the spawned
server (ADT-9/10/11 will), so a real submission ends in a 501 from the
server. That 501 is what we want to see surfaced — proof the whole
plumbing is connected.

1. Open the composer.
2. Type `what does this component do?` into the textarea.
3. Press Enter.
4. **Expect:**
   - The textarea clears.
   - A user message bubble appears in the stream area with the text you
     typed.
   - Immediately after, an error item appears explaining that the agent
     stream is not configured (server returned 501).
5. Open DevTools → Network and inspect the request to `/v1/agent/stream`.
   **Expect:** method `POST`, `authorization: Bearer …` header present,
   request body is JSON `{ prompt, context: { picked, pageContext } }`.
6. **Expect:** the URL `/v1/agent/stream` has NO `?token=…` query — the
   token never travels in the URL.

**Pass/fail signal:** the 501 surfaces as a visible error item in the
panel. If nothing appears, the transport's error path is broken. If the
error appears but the request never went out, the transport isn't being
constructed (check `window.__AGENT_DEVTOOLS_CONFIG__` in the console).

**Where this gets fixed:** `packages/react/src/transport/sse-transport.ts`,
`packages/react/src/orchestrator/mount.ts` (transport wiring),
`packages/vite/src/plugin.ts` (bootstrap injection).

---

## Scenario 4 — Page context is collected on submit

**Goal:** confirm that on each submit the orchestrator captures a fresh
`pageContext` describing the current React tree and any picked element.

1. Open the composer; do **not** pick anything yet.
2. In DevTools, set a breakpoint inside the
   `agent-devtools/react/dist/index.js` `send` call (Sources → search
   for `pageContext`), or simpler: open Network → the
   `/v1/agent/stream` request → "Payload" tab.
3. Type `summarize what's on this page` and submit.
4. **Expect:** the request payload's `context.pageContext` contains:
   - `schemaVersion` (number)
   - `capturedAt` (ISO timestamp)
   - `url` / `route` (the current location)
   - `pageFiles` (array — may be empty in a fresh React app)
   - `errors` (array of recent runtime errors from the observer; empty
     unless you triggered one)
5. **Expect:** `context.picked` is `null` because no element was picked.
6. Cancel/dismiss the submit, then click "Pick" → choose a Users row →
   resubmit.
7. **Expect:** `context.picked` is an object with `tagName`,
   `componentName`, and `selector` populated.

**Pass/fail signal:** if `pageContext` is missing fields or `picked` is
always `null` even after a successful pick, the page-context builder
isn't reading the picked-element state correctly.

**Where this gets fixed:** `packages/react/src/context/index.ts`,
`packages/react/src/context/picked.ts`,
`packages/react/src/observers/` (error observer).

---

## Scenario 5 — Production build leaves zero widget code in the bundle

**Goal:** the headline production-leak guarantee. This is the manual
counterpart to the automated guard in
`packages/vite/src/build-integration.test.ts`.

1. From the example app: `pnpm --filter @agent-devtools/example-react-vite build`
2. Inspect the output:
   ```bash
   for needle in mountAgentDevtools createDefaultTransport __AGENT_DEVTOOLS_CONFIG__ pairingToken @agent-devtools/react; do
     echo "$needle:"
     grep -l "$needle" examples/react-vite/dist/ -r 2>/dev/null || echo "  (no hits)"
   done
   ```
3. **Expect:** every needle returns `(no hits)` against `dist/assets/*.js`
   and `dist/index.html`. The literal string `agent-devtools` may
   appear only as the page `<title>` and `<h1>` text.
4. Open `dist/index.html` in a browser via
   `pnpm --filter @agent-devtools/example-react-vite preview`.
5. **Expect:** the page renders the three cards. There is **no** launcher
   button. No agent server was spawned. No network request goes to
   `127.0.0.1:4317`.

**Pass/fail signal:** any hit for `mountAgentDevtools` /
`createDefaultTransport` / `pairingToken` is a production leak — the
`apply: 'serve'` guard or the user-side `import.meta.env.DEV` gate has
regressed.

**Where this gets fixed:** `packages/vite/src/plugin.ts` (`apply: 'serve'`),
`packages/react/src/orchestrator/mount.ts` (the production refusal in
`mountAgentDevtools`), README guidance for users who manually import the
widget without the plugin.

---

## What this doc explicitly does NOT cover

- A fully-wired Claude Agent SDK factory streaming real responses
  (blocked until ADT-9 / ADT-10 / ADT-11 — Claude SDK provider).
- Playwright-driven automation of the scenarios above. That belongs to
  the post-unit integration phase (U9 integration verification).
- Cross-framework smoke tests (Vue / Next / Nuxt) — those land with the
  framework adapters (U11, post-MVP).

When the Claude provider lands, scenario 3's "expect a 501 error item"
flips to "expect a streaming response with assistant text and a final
done event"; everything else in scenarios 1, 2, 4, 5 stays as written.
