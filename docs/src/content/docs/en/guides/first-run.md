---
title: First run
description: A five-minute walkthrough — open the widget and edit real code with your first prompt.
---

This page assumes you have finished [installation](/en/guides/installation/).

## 1. Start the dev server

```bash
pnpm dev
```

You should see these two lines in the console:

```
[agent-devtools] pairing token (memory-only, rotates per CLI start)
[agent-devtools] provider: acp (default) — connecting to local Claude Code
```

A purple circular widget appears in the bottom-right corner of the browser.

## 2. Open the widget

Click the circular icon and **the chat box expands upward**. If you drag the
icon, the chat box follows along — you can park it at any corner of the screen.

The chat box has three elements:

- **Input field** — where you type your prompt
- **Pick button** — select an element on the page to attach as context
- **Settings (gear icon)** — configure the provider, permission mode, and more

## 3. First prompt: change some text

Start with the simplest scenario. Let's change a "Hello" string somewhere on
the screen to "안녕하세요" (Korean for "Hello").

1. Press the **Pick button** and click the element that reads "Hello".
   - The widget extracts React fiber metadata automatically:
     - `componentName: "HelloHeader"`
     - `sourceLocation: "src/components/HelloHeader.tsx:14"`
2. Type the following prompt into the input field:
   ```
   Change this text to the Korean greeting "안녕하세요".
   ```
3. Press enter.

A streaming response appears in the widget. Claude Code:

1. Reads `HelloHeader.tsx:14`.
2. Proposes an edit that swaps the text.
3. **Applies the edit automatically.** agent-devtools defaults to the
   `acceptEdits` permission mode, so file edits do not raise a separate
   approval prompt. Only side-effect operations such as bash invocations ask
   for confirmation.
4. HMR refreshes the page automatically, and "Hello" on screen becomes
   "안녕하세요".

## 4. Second prompt: change a style

This time, let's adjust an element's padding.

1. Use Pick to select a card element.
2. Prompt:
   ```
   Change this card's padding from 8px to 16px.
   ```
3. Press enter.

If the project uses Tailwind, `p-2` in the className will be replaced with
`p-4`. If the project uses CSS modules, the corresponding `.module.css` file
will be modified. Either way, Claude Code reads the code and makes the call.

## 5. Permission mode options

The default `acceptEdits` makes the first-run experience smooth — file edits
apply automatically, and only side-effect actions like bash ask for approval
in the widget. If you would rather confirm every edit by hand, you can switch
the permission mode in the widget settings to one of the following.

- **`default`** — Claude Code's standard interactive mode. Every tool call
  (including edits) raises an approval prompt in the widget. Useful when you
  want to inspect each edit on your first run.
- **`acceptEdits`** _(default)_ — File edits are auto-approved; only
  side-effects such as bash require approval.
- **`plan`** — Edits are not actually applied; you only receive a plan. Use
  this when you want to scope the work first.
- **`bypassPermissions`** — Every action is auto-approved. This is
  intentionally a dangerous mode and should not be used outside a solo
  development setup. It is exposed only in the settings panel and cannot be
  selected from the chat composer.

For the exact semantics of each mode and the safety guidance, see
[permission modes](/en/guides/permission-modes/).

## 6. What doesn't work

A few boundaries that trip up first-time users:

- **The widget's default context is "the page you are currently looking at".**
  Picking an element attaches its component and source, but the widget does
  not know the full app structure. Broad operations like "rename X across the
  whole project" need to be stated explicitly (Claude Code will use grep/glob
  to find occurrences).
- **Pick relies on React fiber.** Outside of a dev build, fiber metadata is
  laid out differently. Always use it under `pnpm dev`.
- **Approval prompts (when they appear) show up in the widget, not the dev
  server console.** Under the default `acceptEdits` mode, approval prompts
  only appear for side-effect actions like bash. If you are watching only the
  console, things may look stuck — check the widget.

## Next

- [Provider guide](/en/guides/providers/) — ACP vs. SDK and how to choose
- [Widget and page context](/en/guides/widget/) — how Pick works, multiple elements
- [Configuration reference](/en/guides/configuration/) — every Vite plugin option
