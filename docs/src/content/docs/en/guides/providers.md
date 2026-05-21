---
title: Provider — ACP vs SDK
description: How to choose between the ACP (child-process) and SDK (in-process) providers.
---

This page is pending translation (ADT-50).

agent-devtools ships two providers. **C (ACP)** runs Claude Code as a child
process and speaks stdio JSON-RPC; it matches the production agent runtime
most closely. **A (SDK)** runs the Claude Agent SDK in-process; it is faster
to start and easier to embed, but its rate limits follow your Pro / Max
subscription's 5-hour window.

Default: ACP.
