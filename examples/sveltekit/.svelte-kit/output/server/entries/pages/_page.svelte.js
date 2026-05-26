import { N as escape_html } from "../../chunks/dev.js";
//#region src/lib/Counter.svelte
function Counter($$renderer) {
	$$renderer.push(`<div class="counter svelte-dfcawr"><button aria-label="decrement" class="svelte-dfcawr">−</button> <span class="value svelte-dfcawr">${escape_html(0)}</span> <button aria-label="increment" class="svelte-dfcawr">+</button></div>`);
}
//#endregion
//#region src/routes/+page.svelte
function _page($$renderer) {
	$$renderer.push(`<main class="svelte-1uha8ag"><header class="svelte-1uha8ag"><h1 class="svelte-1uha8ag">agent-devtools · SvelteKit</h1> <p class="svelte-1uha8ag">Hover then click any element to pick it for the agent.</p></header> <section>`);
	Counter($$renderer, {});
	$$renderer.push(`<!----></section></main>`);
}
//#endregion
export { _page as default };
