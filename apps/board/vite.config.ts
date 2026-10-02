import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // API runs with `wrangler dev` (apps/api); same origin in production.
    // The API and the public feeds are served by the Worker (wrangler dev).
    proxy: { '/api': 'http://127.0.0.1:8787', '/feeds': 'http://127.0.0.1:8787' },
  },
})
