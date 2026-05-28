---
'@agent-devtools/core': patch
---

Fix the in-process SDK provider being rejected with "API Error: 400 role 'system' is not supported on this model". The provider omitted `systemPrompt`, so the Claude Agent SDK fell back to its minimal default prompt instead of the full Claude Code prompt that `claude -p` uses by default. It now opts into the `claude_code` preset, restoring terminal parity, and pins `settingSources` so project `CLAUDE.md` context cannot be silently dropped by a future SDK default change.
