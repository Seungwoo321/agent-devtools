---
title: Troubleshooting
description: Common errors — pairing token mismatch, ACP handshake failure, SDK rate-limit — and how to fix them.
---

This page collects the symptoms you are most likely to hit when the widget
appears but no response ever comes back, or when the widget itself never
shows up. Every entry is laid out as **Symptom → Cause → Recovery**, and the
Cause section points at the actual source location with a `file:line`
citation.

## Pairing token mismatch (401 Unauthorized)

**Symptom**

- The moment you send a prompt from the widget composer, an error item
  appears in the stream.
- In DevTools → Network the `/v1/agent/stream` (or `/__agent_devtools/...`
  proxy path) response is `401 Unauthorized`, the body is
  `{"error":"unauthorized"}`, and the response carries the header
  `WWW-Authenticate: Bearer realm="agent-devtools"`.

**Cause**

- The server compares the incoming `Authorization: Bearer <token>` header
  against the expected token using a constant-time comparison in
  `verifyAuthorization` (`packages/core/src/server/auth.ts:26`). If the
  header is missing, the scheme is not `Bearer `, the length differs, or
  the value differs, it returns false at that point.
- The 401 response branch is handled by
  `packages/core/src/server/app.ts:286-291`.
- The token is **generated in memory exactly once when the CLI process
  starts**, never persisted to disk, and reissued on every CLI restart
  (`packages/core/src/server/auth.ts:6-12`).
- The Vite plugin injects the token it receives when the dev server starts
  into `window.__AGENT_DEVTOOLS_CONFIG__` on the HTML head only
  (`packages/vite/src/plugin.ts:186-198`). It is never placed in URL query
  strings.

**Recovery**

1. **Hard-reload** the browser (Cmd/Ctrl + Shift + R). If the dev server
   was restarted, the browser may still be holding the previous token.
2. In the DevTools console, log `window.__AGENT_DEVTOOLS_CONFIG__`. If the
   `pairingToken` field is missing or an empty string, the Vite plugin's
   `transformIndexHtml` did not run — verify that the bootstrap script tag
   is present in the HTML emitted by `pnpm dev`.
3. In the Network tab, compare the `Authorization` value on the
   `/v1/agent/stream` request, character by character, against the token
   printed to CLI stdout (or the `pairingToken` from the handle returned
   when you start the `agent-devtools` server directly). Even a single
   character of difference is rejected by the length pre-check at
   `auth.ts:32`.

## Claude Code CLI handshake failure (ACP child terminates immediately after spawn)

**Symptom**

- Right after a prompt is sent, an `acp.error` item shows up in the stream
  area. The error name is usually `Error` / `AcpInitializeError` or
  similar, and the message describes a protocol initialization failure or
  an EOF on the stdio pipe.
- The server console (the output of `pnpm dev`) prints stderr lines
  prefixed with `[acp-child] ...` and the CLI exits immediately.
- Subsequent requests fail with the same error — though because the failed
  spawn promise is evicted from the cache, each request retries from
  scratch.

**Cause**

- The ACP provider locates
  `@agentclientprotocol/claude-agent-acp/dist/index.js` via Node's
  `require.resolve` and spawns a child process using the host's
  `process.execPath`
  (`packages/core/src/providers/acp-runtime.ts:492-513`).
- The child's stderr is piped through to the host process stderr verbatim
  with a `[acp-child] ` prefix (`acp-runtime.ts:500-502`) — this is where
  the raw error text is visible.
- If the spawn step throws, `AcpSessionPool.getChild` removes the broken
  promise from the cache so the next request retries
  (`acp-runtime.ts:155-162`).
- After a successful spawn, `ClientSideConnection.initialize` runs the
  handshake with ACP `PROTOCOL_VERSION` (`acp-runtime.ts:240-247`). If that
  fails, no initial response is received and the connection drops at once.

**Recovery**

1. First, confirm that `claude --version` works in the host environment
   (including that the OAuth credentials under `~/.claude` are still
   alive). The ACP child ultimately launches the Claude Code CLI, so if
   the CLI itself is broken the handshake step fails.
2. Read the stderr lines starting with `[acp-child]` on the server console
   verbatim. The primary cause — `command not found`, `EACCES`,
   `module not found: @anthropic-ai/claude-agent-sdk` — is usually printed
   there directly.
3. Verify that the workspace directory actually exists and is readable —
   ACP's `newSession` takes cwd as an argument
   (`acp-runtime.ts:353`).
4. In a monorepo where `@agentclientprotocol/claude-agent-acp` is only
   installed at the parent workspace and the example cannot hoist it,
   rerun `pnpm install` at the root to restore the `require.resolve` path.

## Claude Agent SDK quota/credit exhaustion

**Symptom**

- While using the SDK provider, the response never starts and an
  `acp.error` shows up immediately. The error name is exposed as the
  original error class name thrown by the SDK (for example, rate-limit /
  usage-limit / unauthorized).
- Alternatively, the response begins but cuts off shortly and the
  `acp.result` arrives with `stopReason` set to `cancelled`.

**Cause**

- The SDK provider calls `query()` from `@anthropic-ai/claude-agent-sdk`
  directly and forwards any error it throws to the widget by wrapping it
  with `toErrorEnvelope` (`packages/core/src/providers/sdk.ts:86-108`). In
  other words, the error name/message that the SDK throws is surfaced
  on the stream as-is.
- If the SDK does not throw but the result message has a `subtype` of
  `error_*`, that turn is normalized to ACP's `cancelled` by
  `mapResultStopReason`
  (`packages/core/src/providers/sdk-to-acp.ts:165-173`).
- Authentication reuses the OAuth credentials under `~/.claude` — unless
  `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` is set in the environment
  (`packages/core/src/providers/sdk.ts:5-9`). The 5-hour usage window of a
  Pro/Max subscription is counted through this OAuth channel.

**Recovery**

1. Launch the `claude` CLI directly from a terminal and check the quota
   state of the same account. If the CLI reproduces the same error, the
   issue is not with the widget but with the account state.
2. Wait for the 5-hour window to reset, or switch to the ACP provider
   (`@agentclientprotocol/claude-agent-acp`) in a separate workspace —
   selecting `acp` from the provider radio in the settings panel makes the
   child call the `claude` binary directly, which can be separated from
   the SDK's usage accounting path.
3. If you want to fall back to API-key billing temporarily, `export
ANTHROPIC_API_KEY` in the shell that starts the dev server and restart.
   Note that the SDK prefers an API key over OAuth, so the billing line
   changes (`sdk.ts:5-9`).

## Port 4317 already in use (sequential fallback behavior)

**Symptom**

- `pnpm dev` does not print EADDRINUSE directly. Instead, the upstream
  port the widget actually talks to is no longer 4317 but 4318, 4319, …,
  shifted up by one each time.
- In DevTools Network the `/__agent_devtools/...` responses come back from
  the same origin, so this is almost never visible in the normal usage
  flow. When you launch the CLI directly, however, the URL printed on
  CLI stdout reads `http://127.0.0.1:<port>` pointing at a different
  port.
- If all 20 attempts are taken, the server throws with the message
  `No free port found in [4317, 4336] on 127.0.0.1`.

**Cause**

- The server starts at `DEFAULT_PORT = 4317` and retries listen up to
  `PORT_FALLBACK_ATTEMPTS = 20` times, incrementing the port by one each
  time (`packages/core/src/server/server.ts:10-11`, `server.ts:47-57`).
- The retry branch is constrained to `EADDRINUSE` only — every other
  error propagates immediately (`server.ts:53-54`).
- When every attempt fails, an Error stating the explicit range
  `[desiredPort, desiredPort + maxAttempts - 1]` is thrown
  (`server.ts:58-59`).
- The bind host is fixed at `LOOPBACK_HOST = 127.0.0.1`, so the server
  never leaks onto an external interface (`server.ts:9`,
  `server.ts:18-19`).

**Recovery**

1. Use `lsof -iTCP:4317 -sTCP:LISTEN` (macOS / Linux) or
   `netstat -ano | findstr 4317` (Windows) to find the process holding
   4317 and clean it up. Usually it is an `agent-devtools` CLI from a
   previous session that did not exit cleanly, or some other tool that
   defaults to the OTLP port.
2. If the port is occupied on purpose, shift the starting port via the
   Vite plugin's `port` option — `agentDevtools({ port: 4400 })`
   (`packages/vite/src/plugin.ts:82-84`).
3. If the throw fires after all 20 slots are exhausted, you are likely
   looking at an indefinite accumulation of stale processes. Clean up
   zombies with `ps aux | grep agent-devtools`.

## Mount refused under NODE_ENV=production

**Symptom**

- The widget never appears, and the following error is printed to the
  console:
  > `agent-devtools: refusing to mount in a production build. This widget is
dev-only. If you really mean it, pass { force: true } — or (recommended)
gate the import behind `import.meta.env.DEV`.`
- The host app itself works correctly.

**Cause**

- The first check in `mountAgentDevtools` throws on the spot when
  `isProductionBuild()` returns true
  (`packages/widget-core/src/orchestrator/mount.ts:230-232`).
- The judgement is a `process.env.NODE_ENV === 'production'` comparison
  (`mount.ts:689-696`). Vite replaces this token with a literal at build
  time, so the standard dev/prod split works as intended.
- At the same time, the Vite plugin is declared with `apply: 'serve'` so
  the plugin code itself is gated out of production builds as a first
  layer of protection (`packages/vite/src/plugin.ts:109`). Hitting this
  error means layer 1 (build-time) was bypassed and `mountAgentDevtools`
  was called directly.

**Recovery**

1. If the host app code imports `mountAgentDevtools` directly, wrap the
   import itself in `if (import.meta.env.DEV)` or an equivalent
   build-environment gate. Mounts that go exclusively through the Vite
   plugin (`agentDevtools()` from `@agent-devtools/vite`) cannot run into
   this error.
2. If you intentionally want to keep the widget alive in a staging /
   preview build, pass `mountAgentDevtools({ force: true })` explicitly
   (`mount.ts:88-96`). This option is a safeguard that turns accidental
   exposure of the widget to a production environment into a deliberate
   decision — it is not an escape hatch for incidents.

## Widget never appears on the dev server at all

**Symptom**

- The host app loads correctly, but the launcher button in the bottom-right
  is missing.
- The DevTools console shows no widget-related errors.
- Nowhere in DevTools Elements is there a `shadow-root` attached to any
  node of the host page.

**Cause**

- The Vite plugin's `transformIndexHtml` does not run if the `enabled`
  option is false, or if the plugin is invoked outside the `apply: 'serve'`
  mode (for example, under `vite build`)
  (`packages/vite/src/plugin.ts:99-109`, `:141-163`).
- Even with `spawnServer: false`, the bootstrap itself is still injected
  but mount happens without a transport — so the launcher appears, and
  any sent message ends with a "not configured" error
  (`plugin.ts:291-308`). The fact that even the launcher is gone means
  the bootstrap script in the head was not injected.

**Recovery**

1. Inspect the dev server's emitted HTML (open it with `view-source:`, or
   via DevTools → Sources → top-level HTML) and verify that the
   `<script type="module">` block contains a `mountAgentDevtools` call. If
   it does not, the plugin was not registered at all — check for a
   missing `plugins: [agentDevtools()]` in `vite.config.ts`, or for
   `enabled: false`.
2. To verify that the `apply: 'serve'` gate isn't the cause, confirm that
   the `vite` command actually runs `dev` (not `build` or `preview`).
3. In custom setups launched in middlewareMode, there is no `httpServer`,
   so the agent server stays alive until the process exits
   (`plugin.ts:131-139`). That is unrelated to the widget being invisible,
   but the leftover process can lead to a 4317 conflict in the next
   session.
