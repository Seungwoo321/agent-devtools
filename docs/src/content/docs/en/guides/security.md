---
title: Security model & pairing token
description: The pairing token, the dev-server-only boundary, and how production exposure is prevented.
---

This page is pending translation (ADT-53).

agent-devtools is strictly a local-development tool. The pairing token is
generated in memory at CLI start and is never written to disk. The widget
only mounts inside an `import.meta.env.DEV` guard, so it is excluded from
production builds.
