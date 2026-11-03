import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        stamp: ['"Jost"', "ui-sans-serif", "system-ui", "sans-serif"],
        read: ['"Literata"', "Georgia", "serif"],
      },
      colors: {
        library: "#0B0B0C",
        "library-deep": "#1A1A1C",
        foil: {
          DEFAULT: "#D8B45C",
          bright: "#EDD08A",
          deep: "#A9873A",
          ink: "#1B1A14",
        },
        paper: {
          DEFAULT: "#ECE6D9",
          muted: "#B8B1A2",
        },
        ribbon: "#B0322E",
        error: "#F0A39A",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
