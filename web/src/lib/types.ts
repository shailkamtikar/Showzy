export type ItemType = 'movie' | 'sports' | 'concert' | 'event'

export type CatalogItem = {
  id: string
  slug: string
  item_type: ItemType
  title: string
  subtitle: string
  description: string
  accent: string
  show_count: number
  next_show_at: string | null
  min_price_minor: number | null
  max_price_minor: number | null
  available: number
  venues: string[] | null
  currency: string
  sold_out: boolean
}

export type ShowRow = {
  id: string
  starts_at: string
  ends_at: string | null
  currency: string
  venue_name: string
  venue_city: string
  venue_type: string
  space_name: string
  layout_version_id: string
  min_price_minor: number | null
  max_price_minor: number | null
  available: number
}

export type ShowDetail = {
  id: string
  catalog_item_id: string
  starts_at: string
  status: string
  currency: string
  item_title: string
  item_type: ItemType
  accent: string
  venue_name: string
  venue_city: string
  venue_type: string
  space_name: string
  layout_metadata: LayoutMeta
}

export type LayoutMeta = {
  kind: 'cinema' | 'stadium' | 'arena'
  format?: string
  screen?: { width: number; height: number; y: number; z: number }
  hall?: { width: number; depth: number; rows: number; cols: number; rake: number }
  field?: { a: number; b: number }
  focus?: 'pitch' | 'stage'
  eye_height?: number
}

export type SeatStatus = 'available' | 'held' | 'sold' | 'blocked' | 'disabled'

export type Seat = {
  id: string // seat_inventory id (what the server needs)
  section_id: string
  row: string
  label: string
  x: number
  y: number
  z: number
  seat_type: string
  accessible: boolean
  status: SeatStatus
  price_minor: number
  tier: string
}

export type Section = {
  id: string
  name: string
  tier: string
  sort_order: number
  total: number
  available: number
  min_price_minor: number
  max_price_minor: number
}

export type AppConfig = {
  max_seats_per_order: number
  hold_duration_seconds: number
  fee_percent: number
  currency: string
}
