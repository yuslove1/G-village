import type { Config } from "tailwindcss";

/**
 * Tokens come straight from the approved screens. Five colours, two faces.
 * The discipline is the point: if a new colour is needed, it goes in here
 * with a name and a reason, not inline as an arbitrary hex.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#141413",
          soft: "#3A3A37",
          muted: "#73726C",
          faint: "#A8A69D",
        },
        teal: {
          DEFAULT: "#0F6E56",
          soft: "#E4F2EC",
          bright: "#1D9E75",
        },
        amber: {
          DEFAULT: "#BA7517",
          soft: "#FAF0DE",
        },
        danger: {
          DEFAULT: "#B3441F",
          soft: "#FAECE7",
        },
        canvas: "#FFFFFF",
        surface: "#F4F2EC",
        hairline: "#ECEAE2",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-lg": ["2rem", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
        "display-md": ["1.625rem", { lineHeight: "1.2", letterSpacing: "-0.015em" }],
        "display-sm": ["1.375rem", { lineHeight: "1.25" }],
      },
      borderRadius: {
        card: "1rem",
        pill: "999px",
      },
      boxShadow: {
        // Deliberately almost nothing. The design leans on hairlines, and a
        // drop shadow anywhere would read as a different product.
        lift: "0 1px 2px rgba(20,20,19,0.04)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 260ms cubic-bezier(0.16,1,0.3,1)",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
