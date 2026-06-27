---
'@agent-devtools/next': patch
---

fix(next): proxy the agent server same-origin so the App Router widget isn't CORS-blocked

The agent server is loopback-only with no `Access-Control-*` surface (by design — same as the Vite path). The Next adapter previously injected the raw `http://127.0.0.1:<port>` agent URL as the widget's base URL, so the in-page widget fetched `/v1/agent/commands` / `/v1/agent/stream` cross-origin from the dev page (`localhost:<port>`) and the browser blocked it: `No 'Access-Control-Allow-Origin' header`. The widget mounted but could never talk to its backend.

`withAgentDevtools` now mirrors the Vite plugin's proxy: it injects a same-origin base path (`/__agent_devtools`) and installs a Next `rewrites()` rule that forwards `/__agent_devtools/:path*` to the agent server. Browser requests stay same-origin (no CORS), the agent server keeps its loopback-only, no-CORS posture, and existing user `rewrites` are composed (proxy rule in `beforeFiles`). When no `baseUrl` is supplied the wrapper adds no rewrite and stays a clean no-op.
