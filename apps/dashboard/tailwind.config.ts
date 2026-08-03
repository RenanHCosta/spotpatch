import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: { extend: { colors: { ink: "#101828", patch: "#ec5b35", canvas: "#f6f7f9" } } },
  plugins: [],
} satisfies Config;
