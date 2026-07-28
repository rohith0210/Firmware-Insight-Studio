/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: { 500: "#38bdf8", 600: "#0ea5e9" },
      },
    },
  },
  plugins: [],
};