import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#080A10",
          900: "#0D1017",
          800: "#12151E",
          700: "#1A1E2A",
          600: "#242A3A",
          500: "#343B4E",
        },
        mist: {
          100: "#F4F6FB",
          300: "#C7CCDB",
          500: "#8A91A8",
          700: "#565E75",
        },
        signal: {
          allow: "#3DDC97",
          deny: "#FF5C6C",
          warn: "#F5B942",
          info: "#5DA9FF",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 12px 30px -14px rgba(0,0,0,0.6)",
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "28px 28px",
      },
    },
  },
  plugins: [],
};
export default config;
