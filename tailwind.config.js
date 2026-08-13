/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#000011',
        // Azul e a cor dominante de acao e destaque.
        revi: {
          50: '#e8f0ff',
          100: '#cfe0ff',
          200: '#9dc0ff',
          300: '#6ba0ff',
          400: '#3a80ff',
          500: '#1466ff',
          600: '#0b4fd6',
          700: '#083ca6',
          800: '#062b76',
          900: '#041a47',
        },
        // Verde restrito ao logo.
        logo: '#00E58A',
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      minHeight: {
        touch: '48px',
      },
      minWidth: {
        touch: '48px',
      },
    },
  },
  plugins: [],
}
