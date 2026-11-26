-- Catalog, venues, layouts, seats, shows, pricing, inventory.
create type item_type   as enum ('movie','sports','concert','event');
create type venue_type  as enum ('stadium','arena','cinema','theatre');
create type show_status as enum ('scheduled','cancelled','completed');
create type seat_status as enum ('available','held','sold','blocked','disabled');

create table catalog_items (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  item_type item_type not null,
  title text not null,
  subtitle text not null default '',
  description text not null default '',
  poster_url text,
  accent text not null default '#6366f1',
  status text not null default 'active' check (status in ('active','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table venues (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  city text not null,
  venue_type venue_type not null
);

create table venue_spaces (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  slug text not null,
  name text not null,
  unique (venue_id, slug)
);

create table venue_layout_versions (
  id uuid primary key default gen_random_uuid(),
  venue_space_id uuid not null references venue_spaces(id) on delete cascade,
  version int not null,
  layout_metadata jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (venue_space_id, version)
);

create table price_tiers (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  sort_order int not null default 0
);

create table sections (
  id uuid primary key default gen_random_uuid(),
  layout_version_id uuid not null references venue_layout_versions(id) on delete cascade,
  name text not null,
  price_tier_id uuid not null references price_tiers(id),
  sort_order int not null default 0,
  unique (layout_version_id, name)
);

create table seats (
  id uuid primary key default gen_random_uuid(),
  layout_version_id uuid not null references venue_layout_versions(id) on delete cascade,
  section_id uuid not null references sections(id) on delete cascade,
  row_label text not null,
  seat_label text not null,
  x double precision not null,
  y double precision not null,
  z double precision not null,
  orientation jsonb not null default '{}'::jsonb,
  seat_type text not null default 'standard',
  is_accessible boolean not null default false,
  unique (layout_version_id, section_id, row_label, seat_label)
);
create index seats_layout_section_idx on seats (layout_version_id, section_id);

create table shows (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  venue_id uuid not null references venues(id),
  venue_space_id uuid not null references venue_spaces(id),
  layout_version_id uuid not null references venue_layout_versions(id),
  starts_at timestamptz not null,
  ends_at timestamptz,
  status show_status not null default 'scheduled',
  currency char(3) not null default 'INR',
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index shows_item_start_idx on shows (catalog_item_id, starts_at);

create table show_prices (
  show_id uuid not null references shows(id) on delete cascade,
  price_tier_id uuid not null references price_tiers(id),
  price_minor bigint not null check (price_minor > 0),
  primary key (show_id, price_tier_id)
);

create table seat_inventory (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references shows(id) on delete cascade,
  seat_id uuid not null references seats(id),
  status seat_status not null default 'available',
  price_tier_id uuid not null references price_tiers(id),
  current_price_minor bigint not null check (current_price_minor >= 0),
  currency char(3) not null default 'INR',
  hold_id uuid,
  unique (show_id, seat_id)
);
create index seat_inventory_show_status_idx on seat_inventory (show_id, status);
create index seat_inventory_show_tier_idx on seat_inventory (show_id, price_tier_id);
create index seat_inventory_hold_idx on seat_inventory (hold_id) where hold_id is not null;
