import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef8f1",
          100: "#d8efdf",
          500: "#348452",
          600: "#286a41",
          700: "#225536"
        }
      }
    }
  },
  plugins: []
};

export default config;
