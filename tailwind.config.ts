import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './apps/**/*.{html,ts,tsx}',
    './packages/**/*.{html,ts,tsx}',
    './public/**/*.html',
  ],
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
