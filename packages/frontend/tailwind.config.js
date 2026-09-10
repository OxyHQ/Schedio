/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './lib/**/*.{js,jsx,ts,tsx}',
    './hooks/**/*.{js,jsx,ts,tsx}',
    '../../node_modules/@oxy.so/services/lib/**/*.{js,jsx}',
    '../../node_modules/@oxy.so/bloom/lib/**/*.{js,jsx}',
  ],
  plugins: [require('tailwindcss-animate')],
};
