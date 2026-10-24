import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // The API, the public feeds and the MCP server run with `wrangler dev` (apps/api);
    // same origin in production.
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/feeds': 'http://127.0.0.1:8787',
      '/mcp': 'http://127.0.0.1:8787',
      '/.well-known/oauth-protected-resource': 'http://127.0.0.1:8787',
    },
  },
})
