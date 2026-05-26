---
title: Permission modes
description: The five permission modes — `default`, `acceptEdits`, `plan`, `bypassPermissions`, `dontAsk` — plus the per-action policy matrix.
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
ACP `session/request_permission` prompt. Every request is resolved in two
stages:

1. **Mode stage** — `bypassPermissions` unconditionally allows;
   `plan` / `default` unconditionally cancel. The remaining interactive
   modes (`acceptEdits`, `dontAsk`) fall through to the policy stage.
2. **Policy stage** — the incoming tool call's ACP `ToolKind` is mapped to
   one of four categories (`fileEdit`, `bash`, `webFetch`, `mcpTool`) and
   the matching `PermissionPolicy` entry (`'auto' | 'ask' | 'deny'`)
   decides the outcome.

### `default`

Cancel every permission request. In the widget transport there is no
surface to collect interactive consent, so any tool that requires approval
is effectively blocked in this mode.

### `acceptEdits` (the initial mode on widget mount)

Auto-allow workspace file edits, defer everything else to the policy. With
the default policy that means `fileEdit` runs unattended while `bash`,
`webFetch`, and `mcpTool` are cancelled — outbound side effects do not slip
through silently in an unattended browser tab.

### `plan`

Read-only planning mode. Permission requests are cancelled regardless of
category. Use it when you want the model to draft a plan before any code
changes.

### `bypassPermissions`

Allow every permission request unconditionally, bypassing the category
policy entirely. This disables every safety prompt for the rest of the
session, which is why it is exposed only via the settings panel and never
from the chat composer.

### `dontAsk`

Takes the same policy path as `acceptEdits`. The SDK semantic is "don't
surface a prompt, deny if not pre-approved", but in the agent-devtools
widget setup there is no prompt surface at all, so in practice `dontAsk`
and `acceptEdits` resolve identically. Use it when you want to make the
"never surface any permission prompt" intent explicit.

## Action category policy matrix

ACP `ToolKind` → category mapping:

| ACP `ToolKind` | Category    | Rationale                                           |
| -------------- | ----------- | --------------------------------------------------- |
| `edit`         | `fileEdit`  | Workspace file mutation                             |
| `delete`       | `fileEdit`  | Workspace file deletion                             |
| `move`         | `fileEdit`  | Workspace file rename / move                        |
| `execute`      | `bash`      | Shell execution — external side effects             |
| `fetch`        | `webFetch`  | Outbound network call                               |
| `other`        | `mcpTool`   | Unclassified MCP tool — unknown side-effect profile |
| `read`         | (safe-read) | Read-only, always auto-allowed                      |
| `search`       | (safe-read) | Search, always auto-allowed                         |
| `think`        | (safe-read) | Internal reasoning, always auto-allowed             |
| `switch_mode`  | (safe-read) | Mode switch, always auto-allowed                    |

Default policy (`DEFAULT_PERMISSION_POLICY`):

| Category   | Default | Meaning                                                    |
| ---------- | ------- | ---------------------------------------------------------- |
| `fileEdit` | `auto`  | Auto-allow — the core devtools workflow                    |
| `bash`     | `ask`   | Cancelled — requires explicit mode elevation to run        |
| `webFetch` | `ask`   | Cancelled — outbound network is opt-in only                |
| `mcpTool`  | `ask`   | Cancelled — unknown third-party tool, conservative default |

Resolution values:

- `'auto'` — pick the lowest-scoped allow option (`allow_once` first).
- `'ask'` — return `outcome: cancelled`. There is no UI to ask, so the
  effect is a soft deny.
- `'deny'` — pick a `reject_once` option when offered, otherwise fall back
  to `outcome: cancelled`.

Mode × category outcome with the default policy:

| Mode \ Category     | `fileEdit` | `bash`    | `webFetch` | `mcpTool` | safe-read |
| ------------------- | ---------- | --------- | ---------- | --------- | --------- |
| `default`           | cancelled  | cancelled | cancelled  | cancelled | cancelled |
| `plan`              | cancelled  | cancelled | cancelled  | cancelled | cancelled |
| `acceptEdits`       | allow      | cancelled | cancelled  | cancelled | allow     |
| `dontAsk`           | allow      | cancelled | cancelled  | cancelled | allow     |
| `bypassPermissions` | allow      | allow     | allow      | allow     | allow     |

## Custom policy

Override the default category-by-category via
`createAcpProvider({ permissionPolicy })` or `runtime.run({ permissionPolicy })`.
Useful when self-hosting (auto-allow Bash inside CI, or hard-deny `mcpTool`,
etc.).

```ts
import { createAcpProvider } from '@agent-devtools/core';

const provider = createAcpProvider({
  permissionPolicy: {
    bash: 'auto', // auto-allow shell calls inside CI
    webFetch: 'deny', // explicitly reject outbound network
  },
});
```

Omitted fields fall back to `DEFAULT_PERMISSION_POLICY`.

Source of truth: `decidePermission` in
`packages/core/src/providers/acp-runtime.ts` plus the `PermissionPolicy`
type and `DEFAULT_PERMISSION_POLICY` constant in
`packages/core/src/providers/acp.ts`.
