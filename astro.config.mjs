import { defineConfig } from 'astro/config'
import mdx from '@astrojs/mdx'
import tailwind from '@astrojs/tailwind'
import nodejs from '@astrojs/node'

// https://astro.build/config
export default defineConfig({
  adapter: nodejs({
    mode: 'middleware' // or 'standalone'
  }),
  output: 'hybrid',
  integrations: [tailwind(), mdx()],
  base: '/'
})
