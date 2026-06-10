-- 0017_restore_api_role_grants.sql
--
-- Some early tables (e.g. `profiles`) were created while connected as a raw
-- superuser, so Supabase's automatic ALTER DEFAULT PRIVILEGES hook never fired
-- and the API roles (anon / authenticated / service_role) were never granted
-- table privileges. The result: edge functions using service_role hit
-- "permission denied for table profiles" even with a valid key, because
-- BYPASSRLS bypasses RLS policies but does NOT replace table-level GRANTs.
--
-- This migration restores the standard Supabase grants. It is safe + idempotent.
-- RLS still governs row visibility; these grants only let the roles reach the tables.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;

-- Make sure future objects inherit the same grants automatically.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines  to anon, authenticated, service_role;
