import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // OOTP Perfect Team tier colors
        tier: {
          iron: "#8a8f98",
          bronze: "#b87333",
          silver: "#c0c5ce",
          gold: "#e3b341",
          diamond: "#5ad1e6",
          perfect: "#c084fc",
        },
        ink: "#0b0e14",
        panel: "#141925",
        panel2: "#1c2433",
        edge: "#2a3346",
        accent: "#5ad1e6",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
