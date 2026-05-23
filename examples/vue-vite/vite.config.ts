import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [
    vue(),
    agentDevtools({
      framework: 'vue',
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 3200,
  },
});
