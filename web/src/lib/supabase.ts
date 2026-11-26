import { createClient } from '@supabase/supabase-js'
import { getEnv } from './env'

const env = getEnv()

// Browser client: publishable key only. All privileged work goes through the FastAPI backend.
export const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true },
})
