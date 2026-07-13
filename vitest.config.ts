import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Alias the same `@/*` path used by Astro so tests can import from
// `@/lib/match-engine/...` without duplicating paths.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    reporters: ['default']
  }
})
