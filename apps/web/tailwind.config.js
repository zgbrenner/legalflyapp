/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1210",
        paper: "#f6f4ef",
        mist: "#e8e4db",
        accent: "#c45c26",
        accentsoft: "#f0d5c4",
        signal: "#1f6f5b",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Helvetica Neue", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        soft: "0 18px 50px rgba(15, 18, 16, 0.08)",
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { opacity: 0.45 },
          "50%": { opacity: 1 },
        },
        rise: {
          "0%": { opacity: 0, transform: "translateY(12px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
      },
      animation: {
        pulseSoft: "pulseSoft 2.4s ease-in-out infinite",
        rise: "rise 0.6s ease-out both",
      },
    },
  },
  plugins: [],
};