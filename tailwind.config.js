/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        green: {
          50: '#f0f9f1',
          100: '#dcefdd',
          200: '#bde0c0',
          300: '#94cb9a',
          400: '#6bb173',
          500: '#4d9455',
          600: '#2D5E40', // Primary
          700: '#264c35',
          800: '#1e3828',
          900: '#172b1e',
          950: '#0b150f',
        },
        amber: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#facc15',
          500: '#dda832',
          600: '#8B5A2B', // Secondary
          700: '#a16207',
          800: '#854d0e',
          900: '#713f12',
          950: '#422006',
        },
      }
    },
  },
  plugins: [],
};