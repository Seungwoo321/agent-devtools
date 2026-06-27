---
'@agent-devtools/next': patch
---

fix(next): read the pairing-token env through literal `process.env` so the App Router client bundle inlines it

The bootstrap read the enabled flag, base URL, and pairing token through a dynamic `globalThis.process.env[key]` lookup. Bundlers can only statically replace **literal** `process.env.<KEY>` member expressions, so that indirection was never substituted — and the Next App Router client bundle has no runtime `process` object, so the lookup resolved to `undefined` and the widget silently never mounted (verified against Next 16 + Turbopack: `typeof process === 'undefined'` in the browser).

`readEnv` now reads each value as a literal `process.env.<KEY>` expression (mirroring the `process.env.NODE_ENV` literal the same module already relies on), so Next's `env`-config inlining substitutes the dev values at build time and the widget mounts. The production dev-only guard is unchanged.
