---
'@agent-devtools/core': minor
'@agent-devtools/widget-core': minor
'@agent-devtools/vite': minor
---

Add slash-command autocomplete to the in-page widget composer.

Typing `/` in the composer now opens a filterable menu of the workspace's slash commands — project and user commands plus skills — each showing its description and argument hint, mirroring the terminal experience. The catalogue is prefetched at mount through a new server endpoint (`GET /v1/agent/commands`) that lists the workspace commands without invoking the model, so the menu is available on the very first keystroke before any message is sent, and it still refreshes from the agent's `available_commands_update` stream. Arrow keys move the highlight, Enter/Tab confirm (inserting `/name ` with the caret ready for arguments), and Escape dismisses the menu. Selecting a command sends the raw text for native runtime expansion — there is no client-side macro expansion. Wired across the html runner and the React, Vue, Vue 2, Next.js, Nuxt, Svelte, SvelteKit and Angular adapters.
