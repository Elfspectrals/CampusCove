import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { mallTemplatesDev } from './build/mallTemplatesDev'
import { seoPrerender } from './build/seoPrerender'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), seoPrerender(), mallTemplatesDev()],
  server: {
    // `.trycloudflare.com`: quick Cloudflare tunnel to share a local build with testers.
    allowedHosts: ['front', '.trycloudflare.com'],
    // set in docker-compose: the Windows bind mount gives no file events, so Vite polls to see edits and pulls
    watch: process.env.CHOKIDAR_USEPOLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
