import { defineConfig } from 'astro/config'
import vercel from '@astrojs/vercel'

// ColorHub is a private, admin-only color-matching app (the /dashboard/* and
// /login routes). The corporate marketing site was removed.
//
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
  base: '/'
})
