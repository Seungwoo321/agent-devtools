---
title: Permission modes
description: The five permission modes — `default`, `acceptEdits`, `plan`, `bypassPermissions`, `dontAsk` — and when to use each.
---

You can switch permission mode from the widget's settings panel. When the
widget mounts without a stored preference, **the initial mode is
`acceptEdits`** (see `DEFAULT_SETTINGS.permissionMode` at
`packages/react/src/settings/types.ts:39`). `bypassPermissions` is exposed
only inside the settings panel — never from the chat composer — and should
be used sparingly.

> The five mode names (`default`, `acceptEdits`, `plan`, `bypassPermissions`,
> `dontAsk`) come straight from the Claude Agent SDK's `permissionMode`
> enum. One of them happens to collide with the English word "default", so
> this guide always writes the mode as a code span (`default`) to keep it
> distinct from the everyday phrase "the initial mode".

## The five modes

The widget user is not at the terminal, so we cannot surface an interactive
ACP `session/request_permission` prompt. Every request is resolved by the
runtime using the active `permissionMode` alone.

### `default`

Reject every permission request. In the widget transport there is no surface
to collect interactive consent, so any tool that requires approval is
effectively blocked in this mode.

### `acceptEdits` (the initial mode on widget mount)

Auto-allow routine file edits inside the workspace boundary. The boundary is
enforced by `FileTools`. Higher-risk actions such as Bash and web fetch still
require explicit consent. A freshly mounted widget starts in this mode.

### `plan`

Read-only planning mode. Permission requests are rejected. Use this when you
want the model to draft a plan before any code changes.

### `bypassPermissions`

Allow every permission request unconditionally. This disables every safety
prompt for the rest of the session, which is why it is exposed only via the
settings panel and never from the chat composer.

### `dontAsk`

Takes the same allow path as `acceptEdits` — picks the `allow_once` option
first so the request is auto-approved. The SDK semantic is "don't surface a
prompt, deny if not pre-approved", but in the agent-devtools widget setup
routine edits inside the workspace are implicitly pre-approved, so in
practice it behaves like `acceptEdits`. Use it when you want to make the
"never surface any permission prompt" intent explicit.

Source of truth: `decidePermission` at
`packages/core/src/providers/acp-runtime.ts:439` — only
`bypassPermissions` / `acceptEdits` / `dontAsk` take the allow path;
`plan` / `default` return `outcome: cancelled`.
