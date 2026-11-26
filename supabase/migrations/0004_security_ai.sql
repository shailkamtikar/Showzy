-- Security events, rate limits, risk, cases, audit log, agent runs. No client access at all.
create table security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  event_type text not null,
  severity text not null default 'info' check (severity in ('info','low','medium','high')),
  source text not null default 'api',
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index security_events_user_idx on security_events (user_id, event_type, created_at desc);
create index security_events_ip_idx on security_events (ip_hash, event_type, created_at desc);
create index security_events_created_idx on security_events (created_at desc);

create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

create table risk_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  score int not null check (score between 0 and 100),
  reasons jsonb not null default '[]'::jsonb,
  detector_version text not null,
  created_at timestamptz not null default now()
);
create index risk_assessments_user_idx on risk_assessments (user_id, created_at desc);

create table investigation_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  status text not null default 'open' check (status in ('open','in_review','closed')),
  max_score int not null default 0,
  summary text not null default '',
  reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index investigation_open_user_idx on investigation_cases (user_id) where status <> 'closed';

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function audit_logs_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs is append-only';
end $$;
create trigger audit_logs_no_update before update or delete on audit_logs
  for each row execute function audit_logs_immutable();

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references investigation_cases(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','running','succeeded','failed','ai_unavailable')),
  model text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result jsonb,
  error text
);
create index agent_runs_case_idx on agent_runs (case_id, started_at desc);

alter table security_events    enable row level security;
alter table rate_limits        enable row level security;
alter table risk_assessments   enable row level security;
alter table investigation_cases enable row level security;
alter table audit_logs         enable row level security;
alter table agent_runs         enable row level security;
revoke all on security_events, rate_limits, risk_assessments, investigation_cases, audit_logs, agent_runs
  from anon, authenticated;
