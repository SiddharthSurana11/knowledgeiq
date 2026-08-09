/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        charcoal: {
          50: '#f6f6f7',
          100: '#e1e3e5',
          200: '#c5c9cd',
          300: '#a2a7af',
          400: '#79808a',
          500: '#5c636e',
          600: '#484d57',
          700: '#3c3f47',
          800: '#33363c',
          900: '#242830', // Surface/Card Background
          950: '#1a1d24', // Sidebar/Secondary Background
          1000: '#0f1115', // Main Background
        },
        teal: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf', // Accent Primary
          500: '#14b8a6', // Accent Darker
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        }
      },
      animation: {
        "spin-slow": "spin 20s linear infinite",
      },
    },
  },
  plugins: [],
};