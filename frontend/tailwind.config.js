/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17212b",
        mist: "#f6f8fb",
        sea: "#0f766e",
        coral: "#d95f43"
      },
      boxShadow: {
        panel: "0 18px 45px rgba(23, 33, 43, 0.08)"
      }
    }
  },
  plugins: []
};
