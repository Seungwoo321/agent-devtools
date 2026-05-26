//#region ../../packages/sveltekit/dist/hooks.js
function createAgentDevtoolsHandle(options = {}) {
	if (!(options.enabled ?? (typeof process === "undefined" || process.env.NODE_ENV !== "production"))) return async ({ event, resolve }) => resolve(event);
	return async ({ event, resolve }) => {
		return resolve(event);
	};
}
//#endregion
//#region src/hooks.server.ts
var handle = createAgentDevtoolsHandle();
//#endregion
export { handle };
