---
title: Introduction
description: agent-devtools is an in-page agent devtool that runs directly inside your dev server. It reuses your own Claude subscription to edit source files in place.
---

## What is agent-devtools

agent-devtools is a **floating widget that lives inside the web app you are
developing**. You type a natural-language prompt into the chat box and the
**Claude Code instance running locally edits the matching source files
directly**.

It is a tool that lets you work without ever leaving the browser tab, without
context-switching to an IDE — you point at the component you can see on screen
and say things like "bump the padding on this card by 8."

## Why we built it

Existing AI coding assistants tended to fall into one of two buckets.

- **Inside the IDE** — the code context is strong, but they have no idea what
  the rendered UI actually looks like right now (the dropdown that happens to
  be open, the form that is currently showing an error).
- **Inside the browser** — the UI context is strong, but the result comes back
  as guidance text along the lines of "here's how you would fix it." A human
  still has to apply the edit.

agent-devtools merges the two worlds.

- The widget lives **inside the browser**, so it picks up the UI context
  exactly as you see it (React fiber, source location).
- Behind the widget, **a local Claude Code instance is connected over stdio
  JSON-RPC (ACP)**, so it edits real files. It can open Pull Requests too.

## Who is it for

- **Developers who already use their own Claude Pro / Max subscription.**
  agent-devtools does not require a new API billing relationship. It reuses
  the `~/.claude` OAuth session of your local Claude Code CLI as-is.
- **Product teams building on React, Vue, Next, or Nuxt.**
  Official adapters ship for React + Vite, Vue 3 + Vite, Next.js 15 (App
  Router + Pages Router), and Nuxt 3. Each one carries a CI-enforced
  production-leak guard against the real build output.
- **People who want a tool that only turns on in the local dev environment.**
  agent-devtools is not included in production builds. It is designed to mount
  only in dev mode (via `import.meta.env.DEV` and equivalents).

## What it is not

This tool is explicitly **not**:

- **Not a production operations tool.** The widget only runs against the local
  dev server. It is never exposed in deployed environments.
- **Not a cloud SaaS.** Everything runs on your own laptop. Your code does not
  leave the network (except for the LLM requests that go to Anthropic).
- **Not an autonomous agent.** It only acts when you send a prompt. With
  permission mode set to `default`, every file change or command execution
  requires explicit approval.
- **Not a new billing model.** It uses your existing Claude subscription. No
  additional payment is involved.
- **Not an OS-level sandbox.** The `workspace` option scopes the picker
  preamble's source-slice reads, but the SDK's own tool calls run with the host
  user's file-system permissions — exactly like running `claude` from a
  terminal in that directory. See
  [Security](/en/guides/security/#workspace-boundary--what-it-does-and-does-not-enforce)
  for the honest scope.

## What to read next

- [Installation](/en/guides/installation/) — wire it into a Vite + React project in five minutes
- [First Run](/en/guides/first-run/) — bring up the widget and send your first prompt
- [Provider Guide](/en/guides/providers/) — choosing between ACP and the SDK
- [Permission Modes](/en/guides/permission-modes/) — configuring file edit permissions
