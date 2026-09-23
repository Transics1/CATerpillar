/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cat: {
          yellow: '#FFCD11',
          dark: '#111111',
          panel: '#1C1C1C',
          border: '#2E2E2E',
          muted: '#8A8A8A'
        },
        state: {
          ok: '#3DD68C',
          warn: '#FFB020',
          danger: '#FF4D4F'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      spacing: {
        // Gloved-hand minimum touch target.
        touch: '3.5rem'
      }
    }
  },
  plugins: []
}
