begin;

-- Some early installations created the base tables before migration tracking
-- existed. Recreate the authorization helpers idempotently so later RLS
-- migrations cannot accidentally authorize against browser-supplied IDs.
create or replace function current_app_user_id() returns uuid
language sql stable security definer set search_path = pg_catalog, public, auth as $$
  select id from public.app_users where auth_subject = auth.user_id()::text
$$;

create or replace function is_family_member(target_family_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public, auth as $$
  select exists (
    select 1 from public.family_memberships
    where family_id = target_family_id and user_id = public.current_app_user_id()
  )
$$;

create or replace function is_family_parent(target_family_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public, auth as $$
  select exists (
    select 1 from public.family_memberships
    where family_id = target_family_id
      and user_id = public.current_app_user_id()
      and role = 'parent'
  )
$$;

commit;
