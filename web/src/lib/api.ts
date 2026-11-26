import { getEnv } from './env'
import { supabase } from './supabase'

export class ApiError extends Error {
  status: number
  code: string
  extra: Record<string, unknown>
  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

type Opts = {
  method?: string
  body?: unknown
  idempotencyKey?: string
  signal?: AbortSignal
}

/** Offset between server clock and this browser (ms), so countdowns follow the server, not the local clock. */
let serverOffsetMs = 0
export const serverNow = () => Date.now() + serverOffsetMs

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const { apiBaseUrl } = getEnv()
  const headers: Record<string, string> = {}
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey
  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`

  const res = await fetch(`${apiBaseUrl}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  })
  const date = res.headers.get('date')
  if (date) serverOffsetMs = new Date(date).getTime() - Date.now()

  if (res.status === 204) return undefined as T
  let json: any = null
  try {
    json = await res.json()
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const e = json?.error ?? {}
    const { code, message, request_id, ...extra } = e
    throw new ApiError(res.status, code ?? 'http_error', message ?? `Request failed (${res.status})`, extra)
  }
  return json as T
}

export const isNetworkError = (e: unknown) => e instanceof TypeError
