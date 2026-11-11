import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import wasm from 'vite-plugin-wasm'
import { mallTemplatesDev } from './build/mallTemplatesDev'
import { seoPrerender } from './build/seoPrerender'

// https://vite.dev/config/
export default defineConfig({
  // Rapier ships its physics as a separate .wasm (compiled while it streams, cached across deploys) instead of the
  // compat build's 2 MB of base64 inside the game chunk. Pre-bundling would inline it again, so it is excluded.
  plugins: [vue(), wasm(), seoPrerender(), mallTemplatesDev()],
  optimizeDeps: { exclude: ['@dimforge/rapier3d'] },
  server: {
    // Docker on Windows gives no file events, so the dev container polls (CHOKIDAR_USEPOLLING). Polling every file each
    // 100 ms over the slow bind mount filled libuv's thread pool and every request queued behind the stat calls: a
    // 1.8 MB lightmap took 20 s instead of 30 ms. Poll once a second and skip the binary assets (rebuilt in place by
    // the Blender scripts; a brand-new one needs a front restart to be served). JSON stays watched for the editor.
    watch: {
      interval: 1000,
      binaryInterval: 3000,
      ignored: ['**/public/assets/**/*.{glb,png,jpg,webp,mp3,hdr,wasm}', '**/dist/**'],
    },
    // Transform the game's modules at start-up instead of on the first /game visit.
    warmup: { clientFiles: ['./src/main.ts', './src/views/GameView.vue'] },
    // `.trycloudflare.com`: quick Cloudflare tunnel to share a local build with testers.
    allowedHosts: ['front', '.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
