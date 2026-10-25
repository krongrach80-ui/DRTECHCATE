import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Prompt'", "'Sarabun'", "'Noto Sans Thai'", 'sans-serif'],
        heading: ["'Prompt'", 'sans-serif'],
        body: ["'Prompt'", "'Sarabun'", 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
