/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'biotech-blue': '#0a0e14',
        'biotech-accent': '#00e5ff',
      }
    },
  },
  plugins: [],
}
