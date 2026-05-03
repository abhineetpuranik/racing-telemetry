/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts,scss}'],
  theme: {
    extend: {
      colors: {
        'bg-base':     '#000000',
        'bg-surface':  '#0d0a0b',
        'bg-elevated': '#160d10',
        'accent':      '#BF2052',
        'accent-deep': '#8B0025',
        'steel':       '#6D7680',
        'offwhite':    '#F3F9FB',
        'positive':    '#4caf7d',
        'negative':    '#e05252',
        'warning':     '#d4a017',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Space Mono"', 'monospace'],
        ui:   ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
