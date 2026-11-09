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
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
