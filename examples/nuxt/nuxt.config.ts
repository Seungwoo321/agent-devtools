export default defineNuxtConfig({
  modules: ['@agent-devtools/nuxt'],
  ssr: true,
  devServer: { port: 3300, host: '127.0.0.1' },
  compatibilityDate: '2025-01-01',
});
