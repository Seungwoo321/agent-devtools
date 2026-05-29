---
'@agent-devtools/react': patch
---

Add a third independent source-extraction channel so picker source
locations survive future React-internal debug-metadata churn. React 18
→ 19 silently dropped `_debugSource` and replaced it with `_debugStack`;
any future major could repeat the pattern. `resolveFiberSource` now
tries, in order:

1. `_debugSource` — React ≤ 18 path (legacy JSX pragma)
2. `_debugStack` — React 19 path (parse the captured Error's stack)
3. `memoizedProps.__source` — JSX source pragma on element props
   (Babel/SWC plugin output). Independent of every React internal
   `_debug*` field.

The existing behaviour is preserved exactly when channel 1 or 2 still
produces a hit. Channel 3 only kicks in when both miss, so the change
is a strict superset of the previous fallback chain.
