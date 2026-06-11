-- 0020_weapons_inspections.sql
-- "סיכום לפי צ׳" view: track two recurring weekly checks per weapons serial.
--   - weapon_check_at = last "בדיקת נשק/אופטיקה"
--   - green_check_at  = last "ירוק בעיניים"
-- Status is derived on the client: null or older than 7 days → "דרוש בדיקה",
-- otherwise show the date. Items flagged no_check_required are exempt entirely.

-- Per-item exempt flag ("פריט לא דורש בדיקה") — set on item creation or from
-- the inventory table. Applies to all serials of that item type.
alter table weapons_items
  add column if not exists no_check_required boolean not null default false;

-- Per-serial last-check timestamps.
alter table weapons_item_serials
  add column if not exists weapon_check_at timestamptz,
  add column if not exists green_check_at  timestamptz;

-- Raspar may UPDATE (mark checks on) serials assigned to a soldier in THEIR
-- own unit. Admin already covered by weapons_serials_write (FOR ALL). RLS OR's
-- permissive policies, so this only widens UPDATE access for raspar.
drop policy if exists weapons_serials_raspar_check on weapons_item_serials;
create policy weapons_serials_raspar_check on weapons_item_serials
  for update
  using (
    is_admin()
    or exists (
      select 1 from soldiers s
      where s.personal_number = weapons_item_serials.assigned_to_pn
        and s.unit_id = current_unit_id()
    )
  )
  with check (
    is_admin()
    or exists (
      select 1 from soldiers s
      where s.personal_number = weapons_item_serials.assigned_to_pn
        and s.unit_id = current_unit_id()
    )
  );
