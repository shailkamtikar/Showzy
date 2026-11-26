import { describe, expect, it } from 'vitest'
import { assertEnv, missingEnv } from './env'

const full = {
  VITE_SUPABASE_URL: 'https://x.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
  VITE_API_BASE_URL: 'http://localhost:8000',
}

describe('env guard', () => {
  it('passes when everything is set', () => {
    expect(missingEnv(full)).toEqual([])
    expect(() => assertEnv(full)).not.toThrow()
  })

  it('names the missing variable', () => {
    const bad = { ...full, VITE_SUPABASE_URL: '' }
    expect(missingEnv(bad)).toEqual(['VITE_SUPABASE_URL'])
    expect(() => assertEnv(bad)).toThrow(/VITE_SUPABASE_URL/)
  })

  it('treats whitespace-only values as missing', () => {
    expect(missingEnv({ ...full, VITE_API_BASE_URL: '   ' })).toEqual(['VITE_API_BASE_URL'])
  })
})
