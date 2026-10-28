import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { seoPrerender } from './build/seoPrerender'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), seoPrerender()],
  server: {
    allowedHosts: ['front'],
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
