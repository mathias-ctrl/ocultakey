/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'rgb(var(--ok-ink) / <alpha-value>)',
        action: 'rgb(var(--ok-action) / <alpha-value>)',
        canvas: 'rgb(var(--ok-canvas) / <alpha-value>)',
        surface: 'rgb(var(--ok-surface) / <alpha-value>)',
        sidebar: 'rgb(var(--ok-sidebar) / <alpha-value>)'
      },
      borderRadius: { ui: '8px' }
    }
  },
  plugins: []
}
