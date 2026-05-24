import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [react(), agentDevtools()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
