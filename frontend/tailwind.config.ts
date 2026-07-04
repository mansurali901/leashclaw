import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "rgb(var(--ink-950) / <alpha-value>)",
          900: "rgb(var(--ink-900) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          600: "rgb(var(--ink-600) / <alpha-value>)",
          500: "rgb(var(--ink-500) / <alpha-value>)",
        },
        mist: {
          100: "rgb(var(--mist-100) / <alpha-value>)",
          300: "rgb(var(--mist-300) / <alpha-value>)",
          500: "rgb(var(--mist-500) / <alpha-value>)",
          700: "rgb(var(--mist-700) / <alpha-value>)",
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
    },
  },
  plugins: [],
};
export default config;
