import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        mute: "var(--mute)",
        "mute-soft": "var(--mute-soft)",
        line: "var(--line)",
        surface: "var(--surface)",
        canvas: "var(--canvas)",
        accent: "var(--accent-green)",
        "accent-hover": "var(--accent-green-hover)",
        "accent-soft": "var(--accent-green-soft)",
        warn: "var(--warn)",
        danger: "var(--danger)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
