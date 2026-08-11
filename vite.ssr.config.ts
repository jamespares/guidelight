import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// SSR-only build for scripts/prerender.mjs. Kept separate from vite.config.ts
// so the Cloudflare plugin (worker + assets build) never sees the SSR bundle.
// The entry is passed on the CLI: vite build --ssr src/entry-server.tsx
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@shared': path.resolve(import.meta.dirname, './shared'),
    },
  },
  build: {
    outDir: 'dist/ssr',
    emptyOutDir: true,
  },
})
