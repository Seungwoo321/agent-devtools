import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [angular(), agentDevtools({ framework: 'angular' })],
  server: {
    host: '127.0.0.1',
    port: 3202,
  },
});
