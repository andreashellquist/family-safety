begin;

-- `user_id` is an output column of this table-returning function. Qualify the
-- membership column so PostgreSQL never resolves it to the output variable.
create or replace function onboard_family(family_name text, display_name text, family_timezone text default 'Europe/Stockholm')
returns table (id uuid, name text, timezone text, user_id uuid, role member_role)
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare new_family public.families; onboarding_user_id uuid;
begin
  if auth.user_id() is null then raise exception 'An authenticated session is required.' using errcode = '42501'; end if;
  insert into public.app_users (auth_subject, display_name) values (auth.user_id()::text, display_name)
    on conflict (auth_subject) do update set display_name = excluded.display_name returning app_users.id into onboarding_user_id;
  if exists (select 1 from public.family_memberships membership where membership.user_id = onboarding_user_id) then
    raise exception 'This account already belongs to a family.' using errcode = '23505';
  end if;
  insert into public.families (name, timezone) values (family_name, family_timezone) returning * into new_family;
  insert into public.family_memberships (family_id, user_id, role) values (new_family.id, onboarding_user_id, 'parent');
  return query select new_family.id, new_family.name, new_family.timezone, onboarding_user_id, 'parent'::member_role;
end;
$$;

commit;
