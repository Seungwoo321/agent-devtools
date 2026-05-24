export interface SvelteSourceLocation {
  fileName: string;
  lineNumber: number;
  columnNumber?: number;
}

/**
 * Shape of the `__svelte_meta` property the Svelte compiler attaches to
 * each DOM element in dev mode. Only `loc` is reliably present across
 * Svelte 4 and Svelte 5. `source` and `component` are optional and may
 * vary between major versions.
 */
export interface SvelteElementMeta {
  loc?: {
    file?: string;
    line?: number;
    column?: number;
  };
  source?: string;
  component?: unknown;
}

export interface SvelteComponentRef {
  componentName: string;
  source?: SvelteSourceLocation;
}
