import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import Status from './Status'

describe('Status page', () => {
  it('shows the Supabase host and API url, but no keys', () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))))
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Status supabaseHost="abc.supabase.co" apiBaseUrl="http://localhost:8000" />
      </QueryClientProvider>,
    )
    expect(screen.getByTestId('supabase-host')).toHaveTextContent('abc.supabase.co')
    expect(screen.getByTestId('api-url')).toHaveTextContent('http://localhost:8000')
    expect(document.body.textContent).not.toMatch(/sb_secret|sb_publishable/)
  })
})
