---
title: Widget & page context
description: The UX of the floating widget, automatic page-context attachment, and how to use the Element Picker.
---

The widget is a single-user chat UI that floats on top of the host page. It
has its own DOM, styles, and React instance that are completely isolated from
the host app's React tree, and it talks to the dev-server agent over HTTP.
This page lays out how the widget is positioned on screen, what input it
accepts, and which context it automatically gathers and attaches to your
prompts.

## Widget structure at a glance

The widget is made up of a single launcher button, a single composer panel,
and an overlay that the picker draws. Where each piece sits inside the host
page DOM is what determines the isolation model.

- **Shadow root (`closed`)** — The widget attaches a single host element
  `<agent-devtools-widget>` to `document.body` and mounts a closed shadow
  root on top of it. Inside the shadow root, `:host { all: initial }` breaks
  inherited styles, so the host app's CSS cannot repaint the widget and the
  widget's CSS cannot leak into the host. Because the shadow root is closed,
  scripts on the host page cannot peek inside the widget via
  `element.shadowRoot` (`packages/widget-core/src/widget/shadow-root.ts:147`).
- **Launcher / composer / settings live inside the shadow root.** The
  launcher button, the composer panel, and the settings panel are all
  appended to the `[data-widget-container]` element inside the shadow root.
  They use `position: fixed` and `z-index: 2147483646` to sit at the very top
  of the stacking context so they never overlap with the host layout
  (`packages/widget-core/src/widget/shadow-root.ts:121`).
- **The element picker overlay lives outside the shadow root.** The outline
  that the picker draws over hovered elements is intentionally appended
  directly to `document.body`. It uses `pointer-events: none` so clicks pass
  through, and it is positioned in a way that keeps it out of
  `elementFromPoint` results — that way users actually grab the real host
  element instead of "the element the widget is covering"
  (`packages/widget-core/src/picker/overlay.ts:69`).
- **Dual React tree.** The widget UI renders inside a React root that is
  completely separate from the host app's React root. The widget does not
  depend on the host's Provider/Context tree, and conversely the widget's
  state never leaks into the host. `mountAgentDevtools()` mounts the
  launcher, composer, settings panel, stream renderer, and picker directly
  onto its own shadow root (`packages/widget-core/src/orchestrator/mount.ts:230`).

## Launcher

A floating round button. It sits in the bottom-right corner of the host page
and toggles the composer open or closed on click.

- **Position and size.** The default position is `{ x: 24, y: 24 }` away
  from the bottom-right of the viewport, and the button is a 48px circle.
  It anchors via `right` / `bottom`
  (`packages/widget-core/src/launcher/launcher.ts:27`).
- **Drag-to-move + persistence.** Holding the button and dragging lets you
  reposition it; on pointerup the coordinates — clamped to the viewport
  bounds — are saved to `localStorage`. On the next mount the launcher
  reappears in the same spot
  (`packages/widget-core/src/launcher/launcher.ts:149`). At mount time the
  saved position is clamped against the current viewport once more, so it
  never ends up off-screen after a window resize.
- **Click vs drag.** Pointer input is routed through a pure reducer
  (`launcher/state.ts`) that distinguishes click from drag, and the
  `onClick` callback only fires for a real click effect. The synthetic
  click that browsers fire at the end of a drag is swallowed by the
  reducer — so the composer never pops open by accident
  (`packages/widget-core/src/launcher/launcher.ts:140`).
- **Click behavior.** The orchestrator checks the current visibility via
  `composer.element.style.display === 'none'` and toggles. When opening, it
  also calls `composer.focus()` so the user can start typing immediately
  (`packages/widget-core/src/orchestrator/mount.ts:405`).
- **The composer follows the launcher.** During a drag, `onPositionChange`
  is called on every move and updates the composer's `setAnchor`. The
  panel's right edge aligns with the launcher's right edge, and the panel's
  bottom edge sits 16px above the launcher
  (`packages/widget-core/src/orchestrator/mount.ts:419`).
- **No global shortcut.** There is no global keyboard shortcut to toggle
  the launcher. The only way to close from the keyboard is to press
  `Escape` while the composer is open (this closes the composer only —
  the launcher stays put).

## Composer

A natural-language input, action buttons, and a streaming message view all
live inside one panel.

- **Default size and anchor.** The panel is 360px wide and 420px tall by
  default, with a minimum of 320×240. Eight-direction resize handles let
  the user drag the panel larger, and the resulting size is persisted to
  `localStorage` under `agent-devtools:panelSize`
  (`packages/widget-core/src/composer/composer.ts:91`).
- **Keyboard behavior.**
  - `Enter` (without Shift) → submit if the text is non-empty and a
    request is not already in flight.
  - `Shift + Enter` → newline.
  - `Escape` → close the composer only (launcher stays)
    (`packages/widget-core/src/composer/composer.ts:541`).
- **Submit payload.** Sent to the orchestrator as `{ text, picked }`. The
  `picked` field is the most recent `PickedEvidence` captured by the picker
  (`null` if nothing was picked). The orchestrator combines this with the
  prompt and the result of `buildPageContext()` and hands it to the
  transport (`packages/widget-core/src/orchestrator/mount.ts:508`).
- **In-flight UI state.** When the transport starts replying it calls
  `setSending(true)`, which disables the textarea and the send button. On
  success or failure it calls `setSending(false)`. To prevent concurrent
  requests an in-flight `AbortController` aborts the previous request when
  a new submit happens (`packages/widget-core/src/orchestrator/mount.ts:487`).
- **Streaming response.** A stream renderer is inserted into the composer
  panel above the textarea. As the transport pipes SSE/JSON chunks into
  `MessageStore.applyEvent()`, the renderer draws them straight onto the
  screen (`packages/widget-core/src/orchestrator/mount.ts:331`).
- **Extra actions.** The composer header has buttons for the picker toggle,
  settings (gear), terminal handoff (continue the conversation in the
  Claude CLI), and new conversation (reset the session). New conversation
  clears the message store and asks the transport's `resetSession()` to
  hand out a fresh server-side ACP session
  (`packages/widget-core/src/orchestrator/mount.ts:560`).

## Settings panel

Clicking the gear button swaps the composer body from the stream view to
the settings view in-place. It is not a separate floating dialog but a
detail view inside the same panel — the same UX pattern used by React
DevTools and TanStack Query DevTools
(`packages/widget-core/src/settings/panel.ts:1`).

There are four settings.

- **Provider** — which runtime handles the next prompt.
  - `acp` — spawn Claude Code as a subprocess and talk to it via the ACP
    protocol (default).
  - `sdk` — call the Claude Agent SDK in-process.

  Providers that are not listed in the server's `/v1/agent/info` response
  are rendered as disabled (greyed-out) radio buttons, so users cannot
  pick a combination that would return 422
  (`packages/widget-core/src/settings/panel.ts:222`).

- **Model** — which model handles the prompt. It exposes the same choices
  as the Claude Code terminal's `/model` menu.
  - `default` _(default)_ — a sentinel that sends no model on the wire, so
    the chosen provider keeps its own default model.
  - `opus` / `sonnet` / `haiku` — pin to that alias.

  Both providers resolve the alias through the shared Claude Agent SDK
  resolver, so no live model-discovery round-trip is needed. The SDK
  provider forwards the alias as the `query()` `model` option; the ACP
  provider applies it with `session/set_model` after the session is
  established and before the prompt is dispatched
  (`packages/widget-core/src/settings/types.ts:31`).

- **Permission Mode** — the blanket policy for the `requestPermission`
  callback. There are five options:
  - `default` — deny every permission request.
  - `acceptEdits` _(default)_ — auto-approve everyday edits inside the
    workspace; bash, web fetch, and similar tools still need a separate
    confirmation.
  - `bypassPermissions` — unconditionally allow every permission request.
    Because of its risk profile, this option is only reachable from the
    settings panel and cannot be selected from any button in the chat
    composer (`packages/widget-core/src/settings/types.ts:10`,
    `packages/widget-core/src/settings/panel.ts:259`). The row itself is
    highlighted with a red background
    (`packages/widget-core/src/settings/panel.ts:163`).
  - `plan` — read-only plan mode.
  - `dontAsk` — the same allow path as `acceptEdits`, but suppresses every
    permission prompt from surfacing.

  See [Permission modes](/en/guides/permission-modes/) for the detailed
  semantics.

- **Theme** — the widget's appearance. It picks the widget's own theme
  independently of the host page.
  - `auto` _(default)_ — follows the OS / host `prefers-color-scheme`.
  - `light` / `dark` — pin to light or dark mode.

One additional read-only piece of information is displayed at the bottom of
the panel.

- **Workspace Root** — the absolute workspace path reported by the server
  (`workspaceRoot` from `/v1/agent/info`). This lets the user confirm which
  root the agent is actually reading from and writing to
  (`packages/widget-core/src/settings/panel.ts:187`).

**Persistence scope.** Provider, model, permissionMode, and theme are
serialised as JSON under the `localStorage` key `agent-devtools:settings`
and survive across mounts
(`packages/widget-core/src/settings/storage.ts:22`). The panel size (the
result of drag-resizing the composer) is stored under a separate key,
`agent-devtools:panelSize`. The launcher position uses
`agent-devtools:launcherPosition` (`launcher/storage.ts`). The server info
(workspace root, the list of registered providers) is re-fetched on every
mount and never persisted. There is no built-in "reset" button — to wipe
persisted values, delete the relevant keys directly from the browser
devtools' Application panel.

## Page context auto-attach

Even if the user does not explicitly pick an element, every submit
automatically attaches a snapshot of the page context. The orchestrator
calls `buildPageContext()` on each submit and bundles the following block
into the transport payload
(`packages/widget-core/src/orchestrator/mount.ts:493`,
`packages/widget-core/src/context/build.ts:53`).

Fields carried by `PageContext`
(`packages/widget-core/src/context/types.ts:164`):

- `schemaVersion` — currently `2`. Compatibility marker for the server-side
  prompt formatter.
- `capturedAt` — the epoch ms at which the context was captured.
- `url` — the full `location.href`.
- `route` — `{ pathname, search, hash }`. Extracted from `window.location`
  regardless of which router (if any) is in use
  (`packages/widget-core/src/context/route.ts:19`).
- `pageFiles` — the list of component source files
  `{ fileName, componentName, lineNumber, columnNumber? }` collected by
  walking the current page's React fiber tree. Duplicate files are
  deduplicated and the list is capped at 50 entries. The walk starts from
  the React root passed in via the `rootContainer` option
  (`packages/react/src/context/build.ts:19`).
- `errors` — the most recent 50 console error / exception records that
  `createErrorObserver()` has been collecting since mount time
  (`packages/widget-core/src/orchestrator/mount.ts:250`).
- `picked` — the `PickedEvidence` captured by the picker, present only
  when an element has actually been picked (see the section below).

The viewport size is not sent as its own field. If the picker is active and
an element has been picked, `picked.boundingRect` does carry
viewport-space coordinates, but the overall viewport size is not part of
the page context.

## Element picker

A hover-and-click tool that lets the user point at an on-screen element
and say "this one". The composer's picker toggle button mirrors the
picker's active / idle state directly.

- **State machine.** The picker runs on a 3-state pure reducer:
  `idle → active → picked → idle`
  (`packages/widget-core/src/picker/state.ts:8`). A click during the active
  state transitions straight to `picked` and the reducer falls back to
  `idle` — this is a **single-selection** model where only **one element
  at a time** can be picked. Multi-element selection is not supported.
- **Hover behavior.** While active, every mousemove uses
  `document.elementFromPoint` to find the element under the pointer and
  the overlay draws an outline on top of it. Because the overlay has
  `pointer-events: none`, it never includes itself in hit-test results
  (`packages/widget-core/src/picker/picker.ts:102`).
- **Click to confirm.** A click while active is prevented from reaching
  the host app via `preventDefault` + `stopPropagation`. The orchestrator's
  `onPick` callback receives the element, runs `describePicked()` to build
  a `PickedEvidence`, and surfaces it as the picked chip on the composer
  (`packages/widget-core/src/orchestrator/mount.ts:385`).
- **Escape to cancel.** Pressing `Escape` while the picker is active
  cancels it and returns to `idle`
  (`packages/widget-core/src/picker/picker.ts:93`).
- **The picker never picks the widget itself.** When the picker starts,
  the widget shadow host and its descendants are filtered out via
  `shouldSkip`. This prevents the picker from accidentally selecting
  itself (`packages/widget-core/src/picker/picker.ts:33`).

A confirmed `PickedEvidence` is not just metadata — it is an
evidence-grade snapshot
(`packages/react/src/context/picked.ts:52`,
`packages/widget-core/src/context/types.ts:79`):

- **Identity** — `componentName`, `tagName`, a best-effort CSS `selector`,
  and `{ fileName, lineNumber, columnNumber? }` extracted from the JSX
  `__source` pragma.
- **DOM evidence** — `outerHTML` (capped at 4096 chars), `boundingRect`,
  the full `name → value` map of every attribute, `text` (the first 120
  chars of textContent), `id`, and `className`.
- **React evidence** — up to 10 named ancestors collected by walking up
  the fiber chain (`componentChain`), plus `propsSnapshot`, a sanitised
  JSON serialisation of the leaf component's `memoizedProps` (functions,
  children, DOM nodes, and circular references are elided; the resulting
  string is capped at 4 KB).

Because this whole bundle is embedded directly into the prompt preamble,
the agent can start answering without a follow-up Read — it already knows
"which component rendered this element, with which props, and how".
