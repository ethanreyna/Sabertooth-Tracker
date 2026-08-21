import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Cloudflare Worker serves the build from the domain root, so absolute
// asset paths are correct. In dev, /api/* is proxied to `wrangler dev`
// (run `pnpm dev:api` alongside `pnpm dev`).
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
});
