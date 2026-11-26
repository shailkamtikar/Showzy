-- Profiles, signup trigger, RLS and least-privilege grants for the public REST endpoint.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users that already exist.
insert into profiles (id, display_name)
select id, split_part(email, '@', 1) from auth.users on conflict (id) do nothing;

alter table catalog_items          enable row level security;
alter table venues                 enable row level security;
alter table venue_spaces           enable row level security;
alter table venue_layout_versions  enable row level security;
alter table price_tiers            enable row level security;
alter table sections               enable row level security;
alter table seats                  enable row level security;
alter table shows                  enable row level security;
alter table show_prices            enable row level security;
alter table seat_inventory         enable row level security;
alter table profiles               enable row level security;

revoke all on all tables in schema public from anon, authenticated;

grant select on catalog_items, venues, venue_spaces, venue_layout_versions,
                price_tiers, sections, seats, shows, show_prices to anon, authenticated;

create policy "public read" on catalog_items         for select using (status = 'active');
create policy "public read" on venues                for select using (true);
create policy "public read" on venue_spaces          for select using (true);
create policy "public read" on venue_layout_versions for select using (is_published);
create policy "public read" on price_tiers           for select using (true);
create policy "public read" on sections              for select using (true);
create policy "public read" on seats                 for select using (true);
create policy "public read" on shows                 for select using (true);
create policy "public read" on show_prices           for select using (true);

-- Users may read only their own profile; no client writes (role cannot be self-promoted).
grant select on profiles to authenticated;
create policy "own profile" on profiles for select to authenticated using (id = auth.uid());
-- seat_inventory: no grants and no policies on purpose (served through the API only).
