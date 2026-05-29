/**
 * Public entry-point for bundler integrations (Vite, Webpack/Next, Vite/Nuxt,
 * Rollup-based tooling) that need to inject the L0 ultra-early error trap
 * BEFORE the widget's module bootstrap evaluates.
 *
 * Kept deliberately tiny: only the constants + string-builder. No DOM, no
 * marked, no dompurify, no observer runtime. A Node-side bundler plugin can
 * import this module without pulling the widget's browser bundle into its
 * Node graph.
 *
 * The drain side of the trap (`drainEarlyErrors`) lives in `observers/early.ts`
 * and is exposed through the main `@agent-devtools/widget-core` entry — that
 * runs in the browser as part of the observer's `start()`. The split is by
 * caller, not by contract: the constants and event shape stay single-source
 * in `observers/early.ts`, and this module re-exports the bundler-facing
 * pieces.
 */
export { EARLY_ERRORS_GLOBAL, buildEarlyErrorTrapScript } from '../observers/early.js';
