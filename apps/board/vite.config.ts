import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // API runs with `wrangler dev` (apps/api); same origin in production.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
})
