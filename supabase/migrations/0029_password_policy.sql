-- 0029_password_policy.sql
-- Force a password refresh every 60 days.
--
-- We track when each user last set their password. The 60-day window and the
-- forced-change screen are enforced client-side (in ProtectedRoute); this column
-- is the source of truth for the age.
--
-- Existing rows default to now() on column add, so nobody is locked out the
-- moment this runs — every user's clock starts fresh and they have 60 days.
alter table public.profiles
  add column if not exists password_changed_at timestamptz not null default now();

comment on column public.profiles.password_changed_at is
  'When the user last set their password. Drives the 60-day forced-refresh check.';

-- profiles is admin-write only (see 0001 profiles_admin_write), so a user cannot
-- stamp their own row directly. This SECURITY DEFINER helper lets the currently
-- authenticated user record that they just changed their password.
create or replace function public.mark_password_changed()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set password_changed_at = now()
   where id = auth.uid();
$$;

revoke all on function public.mark_password_changed() from public;
grant execute on function public.mark_password_changed() to authenticated;
