/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: '#d4a053',
        'gold-dim': '#a07830',
        blue: '#5b8aff',
        'blue-dim': '#3a5fc0',
        surface: '#0a0a12',
        'surface-light': '#14141f',
        'surface-lighter': '#1e1e2d',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
