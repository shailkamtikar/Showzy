-- Holds, orders, demo payments, tickets, restrictions + atomic functions.
create table user_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  max_active_holds int not null default 1,
  requires_verification boolean not null default false,
  reason text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index user_restrictions_user_idx on user_restrictions (user_id);

create table seat_holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  show_id uuid not null references shows(id) on delete cascade,
  status text not null default 'active' check (status in ('active','released','expired','converted')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index seat_holds_user_idx on seat_holds (user_id, status);
create index seat_holds_expiry_idx on seat_holds (status, expires_at);

create table seat_hold_items (
  hold_id uuid not null references seat_holds(id) on delete cascade,
  seat_inventory_id uuid not null references seat_inventory(id),
  primary key (hold_id, seat_inventory_id)
);

alter table seat_inventory
  add constraint seat_inventory_hold_fk foreign key (hold_id) references seat_holds(id) on delete set null;

create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  show_id uuid not null references shows(id),
  hold_id uuid not null unique references seat_holds(id),
  status text not null default 'pending_payment'
    check (status in ('pending_payment','confirmed_demo','cancelled','expired')),
  subtotal_minor bigint not null check (subtotal_minor >= 0),
  fees_minor bigint not null check (fees_minor >= 0),
  total_minor bigint not null check (total_minor >= 0),
  currency char(3) not null default 'INR',
  idempotency_key text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create unique index orders_idem_idx on orders (user_id, idempotency_key) where idempotency_key is not null;

create table order_items (
  order_id uuid not null references orders(id) on delete cascade,
  seat_inventory_id uuid not null references seat_inventory(id),
  section_name text not null,
  row_label text not null,
  seat_label text not null,
  tier_name text not null,
  price_minor bigint not null,
  primary key (order_id, seat_inventory_id)
);

create table demo_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'challenge_issued'
    check (status in ('created','challenge_issued','succeeded_simulated','failed','expired','cancelled')),
  amount_minor bigint not null,
  currency char(3) not null,
  challenge_hash text,
  challenge_expires_at timestamptz,
  failed_attempt_count int not null default 0,
  simulated_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index demo_attempt_live_idx on demo_payment_attempts (order_id)
  where status in ('created','challenge_issued');

create table tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  seat_inventory_id uuid not null references seat_inventory(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticket_code text unique not null,
  created_at timestamptz not null default now(),
  unique (order_id, seat_inventory_id)
);

alter table user_restrictions     enable row level security;
alter table seat_holds            enable row level security;
alter table seat_hold_items       enable row level security;
alter table orders                enable row level security;
alter table order_items           enable row level security;
alter table demo_payment_attempts enable row level security;
alter table tickets               enable row level security;
revoke all on user_restrictions, seat_holds, seat_hold_items, orders, order_items,
              demo_payment_attempts, tickets from anon, authenticated;
grant select on seat_holds, orders, order_items, demo_payment_attempts, tickets to authenticated;
create policy "own holds"    on seat_holds            for select to authenticated using (user_id = auth.uid());
create policy "own orders"   on orders                for select to authenticated using (user_id = auth.uid());
create policy "own items"    on order_items           for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "own attempts" on demo_payment_attempts for select to authenticated using (user_id = auth.uid());
create policy "own tickets"  on tickets               for select to authenticated using (user_id = auth.uid());

-- Expire stale holds and free their seats. Returns what was expired (for security events).
create or replace function release_expired_holds(p_show uuid default null)
returns table(hold_id uuid, user_id uuid, show_id uuid, seat_count int)
language plpgsql as $$
#variable_conflict use_column
begin
  return query
  with exp as (
    update seat_holds h set status = 'expired'
    where h.status = 'active' and h.expires_at <= now() and (p_show is null or h.show_id = p_show)
    returning h.id as hid, h.user_id as uid, h.show_id as sid
  ), rel as (
    update seat_inventory si set status = 'available', hold_id = null
    from exp where si.hold_id = exp.hid and si.status = 'held'
    returning si.hold_id as hid
  ), ord as (
    update orders o set status = 'expired'
    from exp where o.hold_id = exp.hid and o.status = 'pending_payment'
    returning o.id
  )
  select exp.hid, exp.uid, exp.sid, (select count(*)::int from rel where rel.hid = exp.hid) from exp;
end $$;

-- Atomically hold seats. All-or-nothing; rows locked in id order to avoid deadlocks.
create or replace function create_hold(
  p_user uuid, p_show uuid, p_ids uuid[], p_ttl int, p_max_seats int, p_max_active int)
returns table(hold_id uuid, expires_at timestamptz)
language plpgsql as $$
#variable_conflict use_column
declare
  v_ids uuid[]; v_hold uuid; v_active int; v_cap int; v_avail int; v_inshow int; v_exp timestamptz;
begin
  select array_agg(distinct x) into v_ids from unnest(p_ids) x;
  if v_ids is null or array_length(v_ids,1) <> coalesce(array_length(p_ids,1),0) then
    raise exception 'INVALID_SEATS';
  end if;
  if array_length(v_ids,1) > p_max_seats then raise exception 'TOO_MANY_SEATS'; end if;
  if not exists (select 1 from shows where id = p_show and status = 'scheduled') then
    raise exception 'SHOW_NOT_AVAILABLE';
  end if;

  perform release_expired_holds(p_show);

  v_cap := p_max_active;
  select least(v_cap, coalesce(min(r.max_active_holds), v_cap)) into v_cap
    from user_restrictions r
    where r.user_id = p_user and (r.expires_at is null or r.expires_at > now());
  select count(*) into v_active from seat_holds
    where user_id = p_user and status = 'active' and seat_holds.expires_at > now();
  if v_active >= v_cap then raise exception 'HOLD_LIMIT'; end if;

  perform 1 from seat_inventory where id = any(v_ids) order by id for update;
  select count(*) into v_inshow from seat_inventory where id = any(v_ids) and show_id = p_show;
  if v_inshow <> array_length(v_ids,1) then raise exception 'INVALID_SEATS'; end if;
  select count(*) into v_avail from seat_inventory
    where id = any(v_ids) and show_id = p_show and status = 'available';
  if v_avail <> array_length(v_ids,1) then raise exception 'SEAT_UNAVAILABLE'; end if;

  v_exp := now() + make_interval(secs => p_ttl);
  insert into seat_holds (user_id, show_id, status, expires_at)
    values (p_user, p_show, 'active', v_exp) returning id into v_hold;
  update seat_inventory set status = 'held', hold_id = v_hold where id = any(v_ids);
  insert into seat_hold_items (hold_id, seat_inventory_id) select v_hold, unnest(v_ids);
  return query select v_hold, v_exp;
end $$;

-- Atomic simulated payment confirmation. Compare is on HMAC values computed by the API.
create or replace function confirm_demo_payment(
  p_attempt uuid, p_user uuid, p_hmac text, p_max_attempts int)
returns table(result text, order_id uuid, reference text)
language plpgsql as $$
#variable_conflict use_column
declare
  a demo_payment_attempts%rowtype; o orders%rowtype; h seat_holds%rowtype; v_ref text;
begin
  select * into a from demo_payment_attempts where id = p_attempt and user_id = p_user for update;
  if not found then return query select 'not_found', null::uuid, null::text; return; end if;
  if a.status = 'succeeded_simulated' then
    return query select 'already', a.order_id, a.simulated_reference; return;
  end if;
  if a.status not in ('created','challenge_issued') then
    return query select 'invalid', a.order_id, null::text; return;
  end if;
  if a.failed_attempt_count >= p_max_attempts then
    update demo_payment_attempts set status = 'failed', updated_at = now() where id = a.id;
    return query select 'locked', a.order_id, null::text; return;
  end if;
  if a.challenge_expires_at is null or a.challenge_expires_at <= now() then
    update demo_payment_attempts set status = 'expired', updated_at = now() where id = a.id;
    return query select 'invalid', a.order_id, null::text; return;
  end if;
  select * into o from orders where id = a.order_id for update;
  select * into h from seat_holds where id = o.hold_id for update;
  if o.status <> 'pending_payment' or h.status <> 'active' or h.expires_at <= now() then
    return query select 'invalid', a.order_id, null::text; return;
  end if;
  if a.challenge_hash is null or a.challenge_hash <> p_hmac then
    update demo_payment_attempts
      set failed_attempt_count = failed_attempt_count + 1,
          status = case when failed_attempt_count + 1 >= p_max_attempts then 'failed' else status end,
          updated_at = now()
      where id = a.id;
    return query select 'invalid', a.order_id, null::text; return;
  end if;

  v_ref := 'DEMO_TXN_' || replace(gen_random_uuid()::text, '-', '');
  update demo_payment_attempts
    set status = 'succeeded_simulated', simulated_reference = v_ref, challenge_hash = null, updated_at = now()
    where id = a.id;
  update orders set status = 'confirmed_demo' where id = o.id;
  update seat_holds set status = 'converted' where id = h.id;
  update seat_inventory set status = 'sold' where hold_id = h.id;
  insert into tickets (order_id, seat_inventory_id, user_id, ticket_code)
    select o.id, oi.seat_inventory_id, o.user_id,
           'DEMO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
    from order_items oi where oi.order_id = o.id;
  return query select 'ok', o.id, v_ref;
end $$;
