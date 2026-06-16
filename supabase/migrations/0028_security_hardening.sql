-- 0028_security_hardening.sql
-- Two hardening goals:
--   A. Privatize the document storage buckets so objects are no longer served to
--      anonymous visitors. Reads now require an authenticated session, and the
--      client resolves a short-lived signed URL on demand (see src/lib/storage.ts).
--   B. Tighten RLS on the newer modules (vehicles, attendance, bunker) so a single
--      compromised account can't read/write/delete every unit's data, and so the
--      flow tables can only be mutated through their validated SECURITY DEFINER
--      RPCs rather than by arbitrary direct DML.
--
-- Notes:
--   * The bunker is a CENTRAL depot (warehouses aren't owned by a unit and the
--     `unit` columns are free text), so per-unit RLS doesn't fit there. Instead we
--     lock the flow tables to RPC-only writes and gate the reference catalog
--     (warehouses + item list) to admins, matching the original `items` pattern.
--   * SECURITY DEFINER functions run as their owner (the table owner), which
--     bypasses both RLS and the revoked grants, so the RPC write paths keep working.

-- ─────────────────────────────────────────────────────────────────────────────
-- A. STORAGE — make document buckets private; reads require authentication.
-- ─────────────────────────────────────────────────────────────────────────────
update storage.buckets
   set public = false
 where id in ('signing-pdfs', 'vehicle-docs', 'fuel-receipts');

-- signing-pdfs previously had NO read policy (it relied on public = true). Add one.
drop policy if exists signing_pdfs_read on storage.objects;
create policy signing_pdfs_read on storage.objects
  for select to authenticated using (bucket_id = 'signing-pdfs');

-- vehicle-docs / fuel-receipts had read policies with no role (effectively anon).
drop policy if exists vehicle_docs_read on storage.objects;
create policy vehicle_docs_read on storage.objects
  for select to authenticated using (bucket_id = 'vehicle-docs');

drop policy if exists fuel_receipts_read on storage.objects;
create policy fuel_receipts_read on storage.objects
  for select to authenticated using (bucket_id = 'fuel-receipts');

-- ─────────────────────────────────────────────────────────────────────────────
-- B1. VEHICLES — real per-unit RLS. Admin: all units. Raspar: own unit only.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists vehicles_all on vehicles;
create policy vehicles_all on vehicles
  for all to authenticated
  using      (is_admin() or unit_id = current_unit_id())
  with check (is_admin() or (current_role_t() = 'raspar' and unit_id = current_unit_id()));

-- vehicle_types is shared reference data: everyone reads, only admin writes.
drop policy if exists vehicle_types_all on vehicle_types;
create policy vehicle_types_select on vehicle_types
  for select to authenticated using (true);
create policy vehicle_types_admin_write on vehicle_types
  for all to authenticated using (is_admin()) with check (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- B2. ATTENDANCE — rows visible only for soldiers in your unit (admin: all).
--     Writes go exclusively through attendance_confirm_report() (SECURITY DEFINER),
--     so direct table DML is revoked from clients.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists attendance_all on attendance;
create policy attendance_select on attendance
  for select to authenticated
  using (
    is_admin()
    or exists (
      select 1 from soldiers s
      where s.id = attendance.soldier_id
        and s.unit_id = current_unit_id()
    )
  );

revoke insert, update, delete on public.attendance from authenticated;

-- attendance_statuses is shared reference data: everyone reads, only admin writes.
drop policy if exists attendance_statuses_all on attendance_statuses;
create policy attendance_statuses_select on attendance_statuses
  for select to authenticated using (true);
create policy attendance_statuses_admin_write on attendance_statuses
  for all to authenticated using (is_admin()) with check (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- B3. BUNKER — central depot.
--     Flow tables: written ONLY through SECURITY DEFINER RPCs (bunker_apply_*).
--                  Block direct client DML; keep shared read.
--     Reference tables (warehouses, item catalog): shared read, admin-only writes.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'bunker_stock', 'bunker_receipts', 'bunker_unit_stock', 'bunker_dispenses',
    'bunker_credits', 'bunker_transfers', 'bunker_shatsal', 'bunker_regulations'
  ] loop
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select', t
    );
  end loop;
end $$;

-- Reference data: shared read, admin-only writes (mirrors items_admin_write in 0001).
drop policy if exists bunker_warehouses_all on bunker_warehouses;
create policy bunker_warehouses_select on bunker_warehouses
  for select to authenticated using (true);
create policy bunker_warehouses_admin_write on bunker_warehouses
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists bunker_items_all on bunker_items;
create policy bunker_items_select on bunker_items
  for select to authenticated using (true);
create policy bunker_items_admin_write on bunker_items
  for all to authenticated using (is_admin()) with check (is_admin());
