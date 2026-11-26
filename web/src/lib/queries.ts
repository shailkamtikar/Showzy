import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from './api'
import type { AppConfig, CatalogItem, Section, Seat, ShowDetail, ShowRow } from './types'

/** Retry network failures and 5xx (cold start), never 4xx. */
export const retryPolicy = (count: number, e: unknown) =>
  count < 4 && (!(e instanceof ApiError) || e.status >= 500)

const base = { retry: retryPolicy, retryDelay: (n: number) => Math.min(1000 * 2 ** n, 8000) }

export const useCatalog = (type?: string) =>
  useQuery({
    queryKey: ['catalog', type ?? 'all'],
    queryFn: () =>
      api<{ items: CatalogItem[]; total: number }>(`/api/catalog?limit=50${type ? `&type=${type}` : ''}`),
    ...base,
  })

export const useItem = (id?: string) =>
  useQuery({ queryKey: ['item', id], queryFn: () => api<CatalogItem>(`/api/catalog/${id}`), enabled: !!id, ...base })

export const useItemShows = (id?: string) =>
  useQuery({
    queryKey: ['item-shows', id],
    queryFn: () => api<{ items: ShowRow[] }>(`/api/catalog/${id}/shows`),
    enabled: !!id,
    ...base,
  })

export const useShow = (id?: string) =>
  useQuery({ queryKey: ['show', id], queryFn: () => api<ShowDetail>(`/api/shows/${id}`), enabled: !!id, ...base })

export const useSections = (id?: string) =>
  useQuery({
    queryKey: ['sections', id],
    queryFn: () => api<{ items: Section[] }>(`/api/shows/${id}/sections`),
    enabled: !!id,
    ...base,
  })

export const useSeats = (id?: string) =>
  useQuery({
    queryKey: ['seats', id],
    queryFn: () => api<{ items: Seat[] }>(`/api/shows/${id}/seats`),
    enabled: !!id,
    staleTime: 0,
    ...base,
  })

export const useConfig = () =>
  useQuery({ queryKey: ['config'], queryFn: () => api<AppConfig>('/api/config'), staleTime: 60_000, ...base })
