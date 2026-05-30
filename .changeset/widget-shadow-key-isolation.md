---
'@agent-devtools/widget-core': patch
---

Stop host-page keyboard shortcuts from firing while the user types in the
chat panel. Closed shadow root isolates the DOM tree but not events —
`KeyboardEvent` is `composed: true`, so a keystroke inside the panel
retargets onto the shadow host and keeps bubbling to the host document.
A bubble-phase `stopPropagation` for `keydown` / `keyup` / `keypress` is
now attached on the shadow host so widget-internal handlers (composer
`Enter` submit, etc.) still run, but host listeners (Storybook `D`,
Notion `/`, VSCode webview `F1`, …) no longer pick up the event.

Known DOM-standard limit: capture-phase listeners on the host `document`
or `window` still receive the event — they sit higher in the composed
path and run before any widget element's listener. Practically all real
host global shortcuts are bubble-phase, so this is best-effort
isolation, documented in `picker-strategy.md`.
