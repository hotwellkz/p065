import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#6C5DD3",
          dark: "#5540c7",
          light: "#9287ff"
        }
      }
    }
  },
  plugins: []
};

export default config;

