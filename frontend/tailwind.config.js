module.exports = {
  content: ["./src/**/*.{js,jsx}", "./public/index.html"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Barlow", "system-ui", "sans-serif"],
        sans: ["DM Sans", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        ink: "#0B0F17",
        surface: "#111827",
        elevated: "#1F2937",
        accent: { DEFAULT: "#6366F1", hover: "#4F46E5" },
      },
      keyframes: {
        rise: { "0%": { opacity: 0, transform: "translateY(8px)" }, "100%": { opacity: 1, transform: "translateY(0)" } },
        wave: { "0%,100%": { transform: "scaleY(0.3)" }, "50%": { transform: "scaleY(1)" } },
      },
      animation: { rise: "rise .45s ease-out both", wave: "wave 1s ease-in-out infinite" },
    },
  },
  plugins: [],
};
