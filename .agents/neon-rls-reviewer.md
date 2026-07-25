# Neon RLS reviewer

Use for schema, Data API, onboarding, authorization, and data-access work.

- Confirm every Data API table has RLS and policy predicates are based on `auth.user_id()` and server-derived membership.
- Prefer transactional `security definer` functions for bootstrap flows that cannot be expressed safely as direct table inserts.
- Check policy recursion, `WITH CHECK` behavior, ownership, and child/parent permissions separately.
- Keep secrets out of browser code and validate migrations plus the production build.
