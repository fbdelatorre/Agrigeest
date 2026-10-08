/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F0F7F3',
          100: '#DDEEE4',
          200: '#BDDCC9',
          300: '#91C4A4',
          400: '#5EA579',
          500: '#37845A',
          600: '#1F6B45',
          700: '#195638',
          800: '#123D2A',
          900: '#0C2D1F',
          950: '#061A12',
        },
        success: {
          50: '#E8F5EE',
          100: '#D1EAD9',
          500: '#2E8B57',
          600: '#267A4D',
          700: '#1F6940',
        },
        warning: {
          50: '#FFF7E1',
          100: '#FDE8B8',
          500: '#D99A2B',
          600: '#C08A22',
          700: '#A2741D',
        },
        danger: {
          50: '#FDECEC',
          100: '#F9D5D5',
          500: '#D65353',
          600: '#C24444',
          700: '#A53636',
        },
        info: {
          50: '#EAF2FF',
          100: '#D0E3FF',
          500: '#3B82F6',
          600: '#3471DD',
          700: '#2C60BA',
        },
        purple: {
          50: '#F3EEFA',
          100: '#E5DBF5',
          500: '#7C5CC4',
          600: '#6B4DAD',
          700: '#5A4092',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        xl: '12px',
        '2xl': '14px',
      },
      boxShadow: {
        'card': '0 1px 2px 0 rgba(23, 35, 28, 0.04), 0 1px 3px 0 rgba(23, 35, 28, 0.03)',
        'card-hover': '0 2px 8px 0 rgba(23, 35, 28, 0.08), 0 1px 3px 0 rgba(23, 35, 28, 0.04)',
        'topbar': '0 1px 2px 0 rgba(23, 35, 28, 0.04)',
      },
      transitionDuration: {
        '150': '150ms',
        '200': '200ms',
      },
    },
  },
  plugins: [],
};
