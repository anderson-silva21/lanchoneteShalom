/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#142F53',
        paper: '#F8F8F8',
        line: '#E7DFCD',
        mint: '#184E7F',
        tomato: '#7A1E2D',
        amber: '#F27C23',
        cobalt: '#184E7F',
        shalom: {
          night: '#071B34',
          deep: '#142F53',
          blue: '#184E7F',
          gold: '#FAE088',
          orange: '#F27C23',
          wine: '#7A1E2D',
          cream: '#FFF7DF',
          mist: '#EEF5F8'
        }
      },
      fontFamily: {
        sans: ['Inter', 'Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        soft: '0 18px 55px rgba(20, 47, 83, 0.12)',
        glow: '0 18px 60px rgba(250, 224, 136, 0.24)',
        blue: '0 22px 70px rgba(20, 47, 83, 0.18)'
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0)' },
          '50%': { transform: 'translate3d(0, -8px, 0)' }
        },
        glow: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '0.95' }
        },
        rise: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        float: 'float 7s ease-in-out infinite',
        glow: 'glow 5s ease-in-out infinite',
        rise: 'rise 420ms ease-out both'
      }
    },
  },
  plugins: [],
}
