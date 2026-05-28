---
'@agent-devtools/widget-core': minor
---

Persist the widget's visibility across page reloads. The orchestrator now
remembers two on/off axes in localStorage and restores them on mount: the
composer panel's open/closed state (toggled by the launcher, the close button,
Escape, or picking an element) and the widget-level visibility (toggled by the
Ctrl/Cmd+Shift+; hotkey). This matches the standard devtools convention where
the tool reopens in the state you left it. Persistence lives in the
orchestrator rather than the composer because only the orchestrator can tell a
user-driven open/close apart from a system-driven transient collapse (the panel
hiding during element-picking, or the whole surface going dark), so a transient
collapse never clobbers the user's remembered choice. Storage access is wrapped
in try/catch and degrades silently where localStorage is unavailable (file://,
private mode, sandboxed iframes, quota-exceeded).
