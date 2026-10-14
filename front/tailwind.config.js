/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--cc-${name}) / <alpha-value>)`

export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Legacy palette, still referenced by a few game-scene helpers.
        campus: {
          dark: '#1a1a2e',
          navy: '#16213e',
          blue: '#0f3460',
          accent: '#e94560',
        },
        // "Cove Nights" design tokens (see src/style.css and /dev/ui).
        ink: {
          950: token('ink-950'),
          900: token('ink-900'),
          800: token('ink-800'),
          700: token('ink-700'),
          600: token('ink-600'),
          500: token('ink-500'),
        },
        fog: token('fog'),
        mist: token('mist'),
        sun: { DEFAULT: token('sun'), edge: token('sun-edge') },
        pool: { DEFAULT: token('pool'), edge: token('pool-edge') },
        mint: { DEFAULT: token('mint'), edge: token('mint-edge') },
        coral: { DEFAULT: token('coral'), edge: token('coral-edge') },
        grape: { DEFAULT: token('grape'), edge: token('grape-edge') },
        rarity: {
          common: token('r-common'),
          uncommon: token('r-uncommon'),
          rare: token('r-rare'),
          epic: token('r-epic'),
          legendary: token('r-legendary'),
        },
      },
      fontFamily: {
        display: ['"Lilita One"', 'Nunito', 'system-ui', 'sans-serif'],
        sans: ['Nunito', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        chunk: '18px',
      },
      keyframes: {
        'cc-float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'cc-pop': {
          '0%': { transform: 'scale(.92)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'cc-shine': {
          '0%': { transform: 'translateX(-120%) skewX(-20deg)' },
          '100%': { transform: 'translateX(220%) skewX(-20deg)' },
        },
      },
      animation: {
        'cc-float': 'cc-float 5s ease-in-out infinite',
        'cc-pop': 'cc-pop .22s cubic-bezier(.2,1.4,.4,1) both',
        'cc-shine': 'cc-shine 2.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
