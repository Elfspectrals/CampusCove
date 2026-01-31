/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        campus: {
          dark: '#1a1a2e',
          navy: '#16213e',
          blue: '#0f3460',
          accent: '#e94560',
        },
      },
    },
  },
  plugins: [],
}
