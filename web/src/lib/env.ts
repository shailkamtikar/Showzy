const REQUIRED = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_API_BASE_URL',
] as const

export type EnvKey = (typeof REQUIRED)[number]

/** Returns the missing required keys for a given env record (pure, testable). */
export function missingEnv(source: Record<string, unknown>): EnvKey[] {
  return REQUIRED.filter((k) => {
    const v = source[k]
    return typeof v !== 'string' || v.trim() === ''
  })
}

/** Throws a clear error naming every missing variable. */
export function assertEnv(source: Record<string, unknown>): void {
  const missing = missingEnv(source)
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Set them in the repo-root .env file and restart the dev server.',
    )
  }
}

export function getEnv() {
  assertEnv(import.meta.env)
  return {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
    supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, ''),
  }
}
