begin;

-- A device credential belongs to one Windows child account. The preview client
-- is intentionally observe-only until a separately signed native enforcement
-- service and Windows policy are deployed.
alter table devices add column if not exists windows_account_sid text;
alter table devices add column if not exists enforcement_mode text not null default 'observe_only'
  check (enforcement_mode in ('observe_only', 'eligible_pending'));

create or replace function get_family_devices()
returns table (id uuid, member_id uuid, display_name text, platform text, windows_account_sid text, enforcement_mode text, last_seen_at timestamptz, created_at timestamptz, credential_revoked boolean)
language sql stable security definer set search_path = pg_catalog, public, auth as $$
  select d.id, d.member_id, d.display_name, d.platform, d.windows_account_sid, d.enforcement_mode, d.last_seen_at, d.created_at,
    exists (select 1 from public.device_credentials credential where credential.device_id = d.id and credential.revoked_at is not null)
  from public.devices d
  where public.is_family_parent(d.family_id)
  order by d.created_at desc
$$;

create or replace function revoke_family_device(device_uuid uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare family_uuid uuid;
begin
  select d.family_id into family_uuid from public.devices d where d.id = device_uuid for update;
  if family_uuid is null or not public.is_family_parent(family_uuid) then
    raise exception 'Only a parent can revoke a family device.' using errcode = '42501';
  end if;
  update public.device_credentials set revoked_at = coalesce(revoked_at, now()) where device_id = device_uuid;
  insert into public.device_agent_events (family_id, device_id, event_type) values (family_uuid, device_uuid, 'credential_revoked');
end;
$$;

revoke all on function get_family_devices(), revoke_family_device(uuid) from public, anonymous;
grant execute on function get_family_devices(), revoke_family_device(uuid) to authenticated;

commit;
