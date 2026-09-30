import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The dev server forwards /api to Django, so the browser only ever talks to
    // one origin. This makes LAN access and tunnels work without CORS changes.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
    // Accept requests arriving through a tunnel hostname (e.g. *.trycloudflare.com).
    allowedHosts: true,
  },
})
