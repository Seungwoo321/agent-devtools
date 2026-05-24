import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [sveltekit(), agentDevtools({ framework: 'sveltekit' })],
  server: {
    host: '127.0.0.1',
    port: 3204,
  },
});
