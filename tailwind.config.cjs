/** @type {import('tailwindcss').Config} */

const defaultTheme = require('tailwindcss/defaultTheme')

module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Montserrat Variable', ...defaultTheme.fontFamily.sans]
      },
      colors: {
        primary: {
          100: '#E4F7CF',
          200: '#C7EE9A',
          300: '#ACE66A',
          400: '#8FDE36',
          500: '#74BC1F',
          600: '#5B9519',
          700: '#457213',
          800: '#2D4A0C',
          900: '#182706'
        },
        secondary: {
          100: '#D0DCE6',
          200: '#A2BACE',
          300: '#769AB7',
          400: '#4F7696',
          500: '#375268',
          600: '#2C4253',
          700: '#22323F',
          800: '#152028',
          900: '#0B1014'
        }
      },
      textShadow: {
        custom: '2px 2px 4px rgba(0, 0, 0, 0.5)' // Customize the color and shadow values
      }
    }
  },
  plugins: [require('tailwindcss-animated'), require('@tailwindcss/forms')]
}
