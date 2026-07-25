begin;

-- Pairing codes are one-time secrets. Only a SHA-256 digest is retained, so a
-- database read cannot be used to enroll a Windows computer.
create table device_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references app_users(id) on delete cascade,
  device_label text not null check (char_length(device_label) between 1 and 120),
  code_hash text not null unique,
  created_by uuid not null references app_users(id),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_device_id uuid references devices(id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check ((claimed_at is null) = (claimed_device_id is null))
);

create index device_pairing_codes_family_idx on device_pairing_codes(family_id, expires_at);

alter table device_pairing_codes enable row level security;
create policy device_pairing_codes_read_parent on device_pairing_codes
  for select using (is_family_parent(family_id));

create or replace function create_device_pairing_code(target_member_id uuid, requested_device_label text, valid_for_minutes integer default 15)
returns table (pairing_code text, expires_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare family_uuid uuid; raw_code text; pairing public.device_pairing_codes;
begin
  if auth.user_id() is null or valid_for_minutes not between 5 and 60 then
    raise exception 'Invalid device pairing request.' using errcode = '22023';
  end if;
  select family_id into family_uuid from public.family_memberships
    where user_id = public.current_app_user_id() and role = 'parent';
  if family_uuid is null or not exists (
    select 1 from public.family_memberships
    where family_id = family_uuid and user_id = target_member_id
  ) then
    raise exception 'Only a parent can pair a device for a family member.' using errcode = '42501';
  end if;
  raw_code := upper(substr(encode(gen_random_bytes(12), 'hex'), 1, 24));
  insert into public.device_pairing_codes (family_id, member_id, device_label, code_hash, created_by, expires_at)
    values (family_uuid, target_member_id, requested_device_label,
      encode(digest(raw_code, 'sha256'), 'hex'), public.current_app_user_id(),
      now() + make_interval(mins => valid_for_minutes))
    returning * into pairing;
  return query select raw_code, pairing.expires_at;
end;
$$;

create or replace function get_device_pairing_codes()
returns table (id uuid, member_id uuid, device_label text, expires_at timestamptz, claimed_at timestamptz, claimed_device_id uuid)
language sql stable security definer set search_path = pg_catalog, public, auth as $$
  select code.id, code.member_id, code.device_label, code.expires_at, code.claimed_at, code.claimed_device_id
  from public.device_pairing_codes code
  where public.is_family_parent(code.family_id)
  order by code.created_at desc
$$;

-- This is intentionally not a browser/Data API RPC. A server-side enrollment
-- endpoint must atomically verify this digest, create the device and issue a
-- short-lived device credential. The Windows client never receives a family JWT.
commit;
