export interface AngularComponentInstance {
  constructor: { name?: string; (...args: unknown[]): unknown };
  [key: string]: unknown;
}

export interface AngularSourceLocation {
  fileName: string;
  lineNumber: number;
  columnNumber?: number;
}

export interface AngularComponentRef {
  instance: AngularComponentInstance | null;
  componentName: string;
  source?: AngularSourceLocation;
}
