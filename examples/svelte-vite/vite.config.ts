import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [svelte(), agentDevtools({ framework: 'svelte' })],
  server: {
    host: '127.0.0.1',
    port: 3203,
  },
});
