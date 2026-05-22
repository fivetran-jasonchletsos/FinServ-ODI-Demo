/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:  ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['"Source Serif 4"', '"Source Serif Pro"', 'Georgia', '"Times New Roman"', 'serif'],
        mono:  ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        navy: {
          50:  '#eff3f8',
          100: '#d8e2ee',
          200: '#b3c6dd',
          300: '#7e9bc1',
          400: '#4c70a2',
          500: '#2d558a',
          600: '#1d4e89',
          700: '#13315c',
          800: '#0b2545',
          900: '#051628',
        },
        gold: {
          50:  '#fbf7ec',
          100: '#f5ecd1',
          200: '#ebd9a3',
          300: '#dec176',
          400: '#d4af75',
          500: '#b8975c',
          600: '#9a7c42',
          700: '#7a6233',
        },
      },
    },
  },
  plugins: [],
}
