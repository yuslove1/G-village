import type { Config } from "tailwindcss";

/**
 * Two hues, chosen for the relationship between them, not picked separately.
 * Coral sits at ~358° on the wheel; cyan sits at ~188° — genuine
 * complements, not an arbitrary pairing. Coral is the only warm colour in
 * the app and means exactly one thing: tap this (buttons, active states,
 * the sell FAB). Cyan is the cool counterpart — it never asks for a tap, it
 * just stages things: the promo gradient, and cyan-soft as the one
 * product-photo halo everywhere, instead of a different pastel per card.
 * Warm-on-cool is also why a coral badge reads clearly sitting on a
 * cyan-soft tile. Amber is analogous to coral (~40° away, still warm) and
 * stays scoped to ratings/the "UK used" tier so it doesn't compete with the
 * coral=tappable rule. Mint is the one deliberate outlier: success/verified
 * is conventionally green everywhere, so it stays outside this system on
 * purpose. If a new colour is needed, it goes in here with a name and a
 * reason, not inline as an arbitrary hex.
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
        coral: {
          DEFAULT: "#FF5A5F",
          dark: "#E1454A",
          soft: "#FFE7E8",
        },
        cyan: {
          DEFAULT: "#33C7DE",
          dark: "#1B9CB3",
          soft: "#E6F7FA",
        },
        amber: {
          DEFAULT: "#E8A73A",
          soft: "#FCF1DD",
        },
        mint: {
          DEFAULT: "#1FAA71",
          soft: "#E1F5EC",
        },
        danger: {
          DEFAULT: "#C23A3A",
          soft: "#FBE9E9",
        },
        canvas: "#FFFFFF",
        surface: "#F4F3F9",
        hairline: "#EAE8F2",
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
        card: "1.25rem",
        pill: "999px",
      },
      boxShadow: {
        // Cards float instead of just sitting behind a hairline now, so the
        // grid reads closer to the reference screens' soft-shadow product
        // cards. Kept faint and neutral so it works over any tile colour.
        soft: "0 12px 28px -14px rgba(20,20,19,0.18)",
        // Only for coral surfaces — a floating CTA / add-to-cart button
        // wants a coloured glow, not a grey one.
        button: "0 10px 22px -8px rgba(255,90,95,0.45)",
        // A solid offset "lip", not a blur — this is what gives the filter
        // chips a pressable, physical-button feel. Pair with shadow-none and
        // a matching translate-y on :active so the chip visibly sinks into
        // the gap the lip leaves behind.
        edge: "0 3px 0 0 #DDD9EA",
        "edge-coral": "0 3px 0 0 #E1454A",
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
