/**
 * Minimal structural shape for a Vue 3 ComponentInternalInstance. We only
 * model the fields we actually read so tests can construct plain literals
 * without dragging Vue's full runtime types into our type graph.
 *
 * Source-location resolution path:
 *   - `instance.type` carries the component definition (options object or
 *     setup function). `@vitejs/plugin-vue` injects `__file` (absolute SFC
 *     path) in dev mode; `__name` is the inferred component name.
 *   - Vue does not preserve line/column of the JSX-equivalent call site for
 *     SFC templates — only the SFC file. We report file-level granularity
 *     and leave line as 1.
 */

export interface VueSourceLocation {
  fileName: string;
  lineNumber: number;
  columnNumber?: number;
}

export interface ComponentDefinitionLike {
  readonly name?: string;
  readonly __name?: string;
  readonly __file?: string;
  readonly displayName?: string;
}

export interface ComponentInstanceLike {
  readonly uid?: number;
  readonly type?: ComponentDefinitionLike | ((...args: unknown[]) => unknown);
  readonly parent?: ComponentInstanceLike | null;
  readonly vnode?: { readonly el?: unknown; readonly type?: unknown };
  readonly props?: unknown;
  readonly attrs?: unknown;
}

export interface VueComponentRef {
  componentName: string;
  source?: VueSourceLocation;
}
