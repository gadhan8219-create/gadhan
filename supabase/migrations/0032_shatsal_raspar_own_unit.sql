-- 0032_shatsal_raspar_own_unit.sql
-- ============================================================================
-- שצ״ל (combat-use) reporting — scope a raspar to their OWN framework only.
--
-- bunker_apply_shatsal stays open to raspar (unlike the other bunker RPCs, which
-- are admin-only via 0031). But a raspar must NOT be able to report consumption
-- against another framework. Authorization standard (see 0031 / CLAUDE.md):
-- UI gating alone is not enough — enforce on the server too.
--
--   * admin  → may report for any framework (p_unit free).
--   * raspar → may report ONLY for their own framework. The bunker framework
--              string (p_unit) must equal the caller's org unit name
--              (units.name via current_unit_id()).
--   * anyone else → blocked (42501).
--
-- NOTE: this relies on the bunker framework roster (BUNKER_UNITS in
-- src/lib/bunker.ts) matching the org `units.name` values. A raspar whose unit
-- name is not part of the bunker roster cannot report — which is correct: they
-- have no bunker framework.
--
-- Body reproduced verbatim from 0024_bunker_shatsal.sql with the auth guard
-- prepended as the FIRST statement.
-- ============================================================================

create or replace function bunker_apply_shatsal(
  p_unit     text,
  p_reporter text,
  p_used_on  date,
  p_items    jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  it     jsonb;
  v_id   uuid;
  v_qty  numeric;
  v_item uuid;
begin
  -- Authorization: admin reports for any framework; raspar only for their own.
  if not public.is_admin() then
    if public.current_role_t() is distinct from 'raspar'
       or p_unit is distinct from (select name from public.units where id = public.current_unit_id())
    then
      raise exception 'רס״פ רשאי לדווח שצ״ל רק למסגרת שלו' using errcode = '42501';
    end if;
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty  := coalesce((it->>'quantity')::numeric, 0);
    v_item := (it->>'item_id')::uuid;
    if v_qty <= 0 then continue; end if;

    update bunker_unit_stock
      set quantity = greatest(0, quantity - v_qty)
      where unit = p_unit and item_id = v_item;
  end loop;

  insert into bunker_shatsal (unit, reporter, used_on, items, performed_by)
  values (p_unit, p_reporter, coalesce(p_used_on, current_date), p_items, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;
