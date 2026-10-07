/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gbc: {
          teal: '#0C6285',       // Primary Centennial Ocean Blue / Teal
          cyan: '#26A69A',       // Accent Cyan Lotus Tint
          gold: '#D4AF37',       // Metallic Gold Accent
          bronze: '#C58B38',     // Warm Gold / Bronze
          terracotta: '#8B2519', // Deep Warm Red
          cream: '#FDF7E7',      // Light Warm Canvas Background
        }
      }
    },
  },
  plugins: [],
}
