/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string
  readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY: string
  readonly SUPABASE_SECRET_KEY: string
  // Optional. If unset, we derive it from PUBLIC_SUPABASE_URL as
  // `<project>.supabase.co/auth/v1/.well-known/jwks.json`.
  readonly SUPABASE_JWKS_URL: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare namespace App {
  interface Locals {
    user: {
      id: string
      email: string
      isAdmin: boolean
      organizationId: number
    } | null
  }
}
