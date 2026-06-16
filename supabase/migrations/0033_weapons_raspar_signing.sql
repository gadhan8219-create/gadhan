-- 0033_weapons_raspar_signing.sql
-- ============================================================================
-- Let a raspar sign / return / transfer / zero weapons for soldiers in THEIR
-- OWN unit. The weapons pages (checkout, transfer) are already open to raspar in
-- the UI, but the only raspar write policy was weapons_serials_raspar_check
-- (0020) — an UPDATE permitted only when the serial is ALREADY assigned to a
-- soldier in the raspar's unit.
--
-- Bug: signing assigns a FREE serial (assigned_to_pn: NULL -> soldier). The OLD
-- row is unassigned, so the `using` clause found no matching soldier and the
-- admin-only weapons_serials_write also failed → the UPDATE matched 0 rows and
-- Postgres returned success with NO error. The weapon never got signed and the
-- user saw no failure. Inserting synthetic qty rows was likewise admin-only.
--
-- Authorization standard (see 0031 / CLAUDE.md): enforce on the server. A raspar
-- may write a serial row only when the soldier involved (old OR new holder) is
-- in their unit, or the serial is unassigned (signing a free serial / returning
-- one to the battalion pool). Admin keeps full access via weapons_serials_write.
-- ============================================================================

-- Replace the narrow check-only policy with a broader own-unit management policy.
drop policy if exists weapons_serials_raspar_check on weapons_item_serials;

-- UPDATE: raspar may touch a serial when the current holder is a soldier in
-- their unit OR the serial is unassigned (signing), and the RESULT is assigned
-- to a soldier in their unit OR unassigned (returning).
create policy weapons_serials_raspar_update on weapons_item_serials
  for update
  using (
    is_admin()
    or (current_role_t() = 'raspar' and (
          weapons_item_serials.assigned_to_pn is null
          or exists (
            select 1 from soldiers s
            where s.personal_number = weapons_item_serials.assigned_to_pn
              and s.unit_id = current_unit_id()
          )
        ))
  )
  with check (
    is_admin()
    or (current_role_t() = 'raspar' and (
          assigned_to_pn is null
          or exists (
            select 1 from soldiers s
            where s.personal_number = assigned_to_pn
              and s.unit_id = current_unit_id()
          )
        ))
  );

-- INSERT: raspar may insert synthetic quantity rows (non-serial items) assigned
-- to a soldier in their unit. Admin already covered by weapons_serials_write.
drop policy if exists weapons_serials_raspar_insert on weapons_item_serials;
create policy weapons_serials_raspar_insert on weapons_item_serials
  for insert
  with check (
    is_admin()
    or (current_role_t() = 'raspar' and exists (
          select 1 from soldiers s
          where s.personal_number = assigned_to_pn
            and s.unit_id = current_unit_id()
        ))
  );
