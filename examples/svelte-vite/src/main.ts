import { mount } from 'svelte';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) {
  throw new Error('agent-devtools example: missing #app target');
}

mount(App, { target });
