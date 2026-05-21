import type { ErrorRecord } from '../observers/types.js';
import type { FiberSourceLocation } from '../fiber/types.js';

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
 * One link in the React component breadcrumb leading from the picked
 * element up to the nearest named ancestor. Stored leaf-first so the
 * prompt reads naturally: `Picked: TodoItem (in TodoList in App)`.
 */
export interface ComponentChainEntry {
  componentName: string;
  /**
   * Source location set by the JSX `__source` pragma. Absent for
   * fibers without a `_debugSource` (host fibers, production builds,
   * libraries that ship pre-transpiled JSX).
   */
  source?: FiberSourceLocation;
}

/**
 * Evidence-grade snapshot of the user-picked DOM element. The widget
 * collects everything the agent needs to reason about the element
 * without issuing follow-up tool calls: rendered HTML, layout, the React
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
  /** Source location of the leaf component (the picked fiber), if known. */
  source?: FiberSourceLocation;
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

  // React evidence
  /**
   * Named React ancestors, leaf-first. The first entry is typically the
   * leaf component itself when it has a name; the last is the
   * outermost named ancestor we found before hitting unnamed
   * intrinsics (host fibers, etc).
   */
  componentChain: readonly ComponentChainEntry[];
  /**
   * Sanitised snapshot of the leaf React component's props. Functions,
   * React children, DOM nodes and circular structures are elided; the
   * remaining JSON is capped at ~4 KB and reported as a string so the
   * server can embed it verbatim into the preamble.
   */
  propsSnapshot?: string;
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
  /** Source files seen in the rendered fiber tree, dedup'd by file name. */
  pageFiles: PageFileEntry[];
  /** The user-picked element, if any. */
  picked?: PickedEvidence;
  /** Recent observer records — last `maxErrors` only. */
  errors: ErrorRecord[];
}
