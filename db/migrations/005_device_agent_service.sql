begin;

-- Device credentials are server-only. The Data API receives no grants or RLS
-- policies for these tables; a deployed agent API uses the private DATABASE_URL
-- and derives every device/family relation inside a transaction.
create table device_credentials (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id) on delete cascade,
  token_hash text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  check (expires_at is null or expires_at > issued_at)
);

create unique index device_credentials_active_device_unique
  on device_credentials(device_id) where revoked_at is null;

create table device_agent_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  device_id uuid not null references devices(id) on delete cascade,
  event_type text not null check (event_type in ('enrolled', 'policy_delivered', 'heartbeat', 'credential_revoked')),
  policy_version integer,
  enforcement_state text,
  created_at timestamptz not null default now()
);

create index device_agent_events_device_created_idx on device_agent_events(device_id, created_at desc);

alter table device_credentials enable row level security;
alter table device_agent_events enable row level security;
revoke all on table device_credentials, device_agent_events from anonymous, authenticated;

commit;
