import { defineConfig } from 'astro/config'
import mdx from '@astrojs/mdx'
import vercel from '@astrojs/vercel'
import sitemap from '@astrojs/sitemap'

// https://astro.build/config
export default defineConfig({
  output: 'server',
  prefetch: {
    prefetchAll: true
  },
  adapter: vercel({
    webAnalytics: {
      enabled: true
    }
  }),
  site: 'https://ecotecplast.com',
  integrations: [mdx(), sitemap()],
  base: '/'
})
