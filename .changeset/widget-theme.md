---
'@agent-devtools/widget-core': minor
---

Add a theme to the floating chat and every widget surface: a new `theme`
setting with `auto` (the default), `light`, and `dark`. `auto` follows the
operating system's `prefers-color-scheme`; `light` and `dark` pin the choice.
The setting persists in localStorage alongside the provider and permission mode,
and switching it flips a single `data-theme` attribute on the closed shadow
host, so the browser recomputes every colour through CSS custom properties with
no per-component re-render.

The dark palette is the only set of tokens defined centrally on the host. Light
is the absence of tokens: every surface reads its colour as
`var(--adt-token, <literal>)`, where the literal fallback is that element's
original light colour. So light stays byte-identical to the previous look and
each surface keeps its own light nuance, while dark is single-sourced — the same
token can resolve to a different light value per surface (a user bubble's text
is white in light, body text is near-black, and both become the same light grey
in dark). Surfaces that are intentionally dark in both themes (the picked-element
code card) keep their dark treatment by reading a raised-surface token rather
than inverting with the accent.

Every widget surface participates: the composer, launcher, message stream,
picked-element evidence, tool output, handoff modal, and settings panel. The
launcher and accent controls invert correctly so dark mode reads as a true dark
theme rather than a tinted light one.
