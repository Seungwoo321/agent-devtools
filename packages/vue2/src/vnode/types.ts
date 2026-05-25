export interface Vue2SourceLocation {
  fileName: string;
  lineNumber: number;
  columnNumber?: number;
}

export interface Vue2ComponentOptions {
  readonly name?: string;
  readonly __name?: string;
  readonly __file?: string;
  readonly displayName?: string;
  readonly _componentTag?: string;
}

export interface Vue2ComponentInstance {
  readonly _uid?: number;
  readonly $options?: Vue2ComponentOptions;
  readonly $parent?: Vue2ComponentInstance | null;
  readonly $el?: unknown;
  readonly $props?: unknown;
  readonly $attrs?: unknown;
}

export interface Vue2ComponentRef {
  componentName: string;
  source?: Vue2SourceLocation;
}
