export const index = 1;
let component_cache;
export const component = async () =>
  (component_cache ??= (await import('../entries/fallbacks/error.svelte.js')).default);
export const imports = [
  '_app/immutable/nodes/1.D__wEODW.js',
  '_app/immutable/chunks/eYpR7Yn_.js',
  '_app/immutable/chunks/Bb-pn1ur.js',
  '_app/immutable/chunks/DEDqjojZ.js',
];
export const stylesheets = [];
export const fonts = [];
