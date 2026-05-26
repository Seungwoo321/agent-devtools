import type { ErrorRecord } from '../observers/types.js';

/**
 * The single shape the server's agent prompt formatter consumes. All
 * fields are stable: bump `schemaVersion` if the shape ever changes.
 *
 * `schemaVersion = 2` introduces `PickedEvidence` (replaces the v1
 * `PickedDescriptor` metadata-only payload). The agent now receives
 * outerHTML + componentChain + propsSnapshot so a short prompt like
 * "explain this" has enough grounding without the agent needing to issue
 * a follow-up Read call.
 */
export const PAGE_CONTEXT_SCHEMA_VERSION = 2 as const;

export interface RouteInfo {
  pathname: string;
  search: string;
  hash: string;
  /**
   * Workspace-relative path of the route's source file (e.g.
   * `pages/blog/[slug].tsx`, `pages/index.vue`). Populated by adapters
   * that have framework routing metadata available (Next Pages Router,
   * Nuxt). Omitted when the host has no router or the adapter cannot
   * resolve a definitive file — leaving it unset is safer than guessing.
   */
  routeFile?: string;
}

/**
 * A 2D bounding box for the picked element in the viewport's coordinate
 * space (CSS px). Lets the agent talk about visual locality ("this is the
 * primary action in the header") without seeing a screenshot.
 */
export interface BoundingRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Framework-agnostic source location. Adapters fill these from their own
 * walkers — React from JSX `_debugSource` / `_debugStack`, Vue from SFC
 * `__file`, Svelte from `__svelte_meta`, etc. `columnNumber` is best-effort.
 */
export interface SourceLocation {
  fileName: string;
  lineNumber: number;
  columnNumber?: number;
}

/**
 * One link in the component breadcrumb leading from the picked element
 * up to the nearest named ancestor. Stored leaf-first so the prompt reads
 * naturally: `Picked: TodoItem (in TodoList in App)`.
 */
export interface ComponentChainEntry {
  componentName: string;
  /**
   * Source location set by the adapter's walker. Absent for unnamed host
   * nodes, production builds, or libraries that ship pre-transpiled output.
   */
  source?: SourceLocation;
}

/**
 * Evidence-grade snapshot of the user-picked DOM element. The widget
 * collects everything the agent needs to reason about the element
 * without issuing follow-up tool calls: rendered HTML, layout, the
 * component chain that owns it, and a sanitised view of the leaf
 * component's props.
 *
 * Naming note: this used to be called `PickedDescriptor` and carried
 * only metadata (component name, tag, selector, source path). That
 * shape produced "Pick → ask → unrelated answer" failures because the
 * agent had a file path but never the file contents. v2 fixes the
 * design — the widget ships evidence, not metadata.
 */
export interface PickedEvidence {
  // Identity
  componentName: string;
  /** Source location of the leaf component (the picked node), if known. */
  source?: SourceLocation;
  /** Uppercased HTML tag name, e.g. 'DIV'. */
  tagName: string;
  /** Best-effort CSS selector that resolves to the picked element. */
  selector: string;

  // DOM evidence
  /**
   * `outerHTML` of the picked element, truncated. Critical for the
   * agent: lets it reason about rendered attributes, child structure,
   * inline styles without a Read call.
   */
  outerHTML: string;
  /** Viewport-space bounding box (CSS px). Absent in non-DOM environments (tests). */
  boundingRect?: BoundingRect;
  /** All attributes of the picked element, name → value. */
  attributes: Readonly<Record<string, string>>;
  /** First slice of textContent (whitespace-collapsed), truncated. */
  text?: string;
  /** Convenience copy of attributes.id when set. */
  id?: string;
  /** Convenience copy of attributes.class when set. */
  className?: string;

  // Framework evidence
  /**
   * Named component ancestors, leaf-first. The first entry is typically
   * the leaf component itself when it has a name; the last is the
   * outermost named ancestor the adapter's walker found before hitting
   * unnamed intrinsics (host fibers, anonymous fragments, etc).
   */
  componentChain: readonly ComponentChainEntry[];
  /**
   * Sanitised snapshot of the leaf component's props. Functions,
   * children, DOM nodes and circular structures are elided; the
   * remaining JSON is capped at ~4 KB and reported as a string so the
   * server can embed it verbatim into the preamble.
   */
  propsSnapshot?: string;
  /**
   * Workspace-relative paths of the source files that the picked
   * component's own source file imports. Populated by the orchestrator's
   * `enrichPageContext` hook when the dev server exposes a module graph
   * (Vite). Absent when no source location was resolved, the dev server
   * cannot answer, or enrichment was aborted — the agent still has the
   * picked evidence, just without the dependency shortcut.
   */
  relatedImports?: readonly string[];
  /**
   * A small window of source code around the picked component's line,
   * fetched from the dev server. Populated by the orchestrator's
   * `enrichPageContext` hook when both `source.fileName` and
   * `source.lineNumber` are known and the dev server can answer. Absent
   * when no source location was resolved, the dev server cannot read the
   * file (outside workspace, missing, binary), or enrichment was aborted.
   * The agent receives the surrounding code without an extra Read call.
   */
  sourceSlice?: SourceSlice;
}

/**
 * Code excerpt centered on a specific line. `code` is the literal slice
 * with original newlines preserved; `startLine` and `endLine` are
 * 1-based inclusive line numbers in the source file. The window is
 * computed by the dev server (Vite plugin) — the widget contract is
 * "ask, take what you get, ship the rest" so the orchestrator never
 * inspects the contents, only forwards them.
 */
export interface SourceSlice {
  readonly code: string;
  readonly startLine: number;
  readonly endLine: number;
}

export interface PageFileEntry {
  fileName: string;
  componentName: string;
  lineNumber: number;
  columnNumber?: number;
}

export interface PageContext {
  schemaVersion: typeof PAGE_CONTEXT_SCHEMA_VERSION;
  capturedAt: number;
  url: string;
  route: RouteInfo;
  /** Source files seen in the rendered component tree, dedup'd by file name. */
  pageFiles: PageFileEntry[];
  /** The user-picked element, if any. */
  picked?: PickedEvidence;
  /** Recent observer records — last `maxErrors` only. */
  errors: ErrorRecord[];
}
