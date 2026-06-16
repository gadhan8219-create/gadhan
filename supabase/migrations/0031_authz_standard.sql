-- 0031_authz_standard.sql
-- ============================================================================
-- AUTHORIZATION STANDARD — server-side role enforcement for privileged actions.
--
-- UI route-gating (ProtectedRoute requireAdmin) hides screens, but anyone who
-- can call the Supabase API directly could still invoke a SECURITY DEFINER RPC.
-- From now on EVERY privileged action must ALSO be enforced on the server:
--
--   * Table writes  → RLS policy `with check (is_admin() …)` (already the norm).
--   * SECURITY DEFINER RPCs → call `perform require_admin();` (or the matching
--     role guard) as the FIRST statement in the function body.
--
-- Helpers provided here:
--   require_admin()           — raise unless caller is an active admin.
--   require_raspar_or_admin() — raise unless caller is an active admin or raspar.
--
-- Apply this convention to all future RPCs that perform a privileged action.
-- ============================================================================

-- ── Role guards ──────────────────────────────────────────────────────────────
-- 42501 = insufficient_privilege. SECURITY DEFINER + auth.uid() reflects the
-- CALLER (JWT claims survive the definer switch), so is_admin() is correct here.
create or replace function public.require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'הרשאת מנהל נדרשת' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.require_raspar_or_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.current_role_t() = 'raspar') then
    raise exception 'נדרשת הרשאת רס״פ או מנהל' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.require_admin() from public;
revoke all on function public.require_raspar_or_admin() from public;
grant execute on function public.require_admin() to authenticated;
grant execute on function public.require_raspar_or_admin() to authenticated;

-- ── Bunker write RPCs — now admin-only on the server too ──────────────────────
-- Bodies reproduced verbatim from 0021/0022/0023/0025 with a require_admin()
-- guard prepended. bunker_apply_shatsal stays open (raspar reports שצ"ל).

create or replace function bunker_apply_receipt(
  p_warehouse uuid,
  p_receiver  text,
  p_source    text,
  p_items     jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  it          jsonb;
  v_receipt   uuid;
begin
  perform require_admin();
  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce((it->>'quantity')::numeric, 0) <= 0 then
      continue;
    end if;
    insert into bunker_stock (warehouse_id, item_id, quantity)
    values (p_warehouse, (it->>'item_id')::uuid, (it->>'quantity')::numeric)
    on conflict (warehouse_id, item_id)
    do update set quantity = bunker_stock.quantity + excluded.quantity;
  end loop;

  insert into bunker_receipts (warehouse_id, receiver, source, items, performed_by)
  values (p_warehouse, p_receiver, p_source, p_items, auth.uid())
  returning id into v_receipt;

  return v_receipt;
end;
$$;

create or replace function bunker_apply_dispense(
  p_warehouse uuid,
  p_unit      text,
  p_person    text,
  p_items     jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  it       jsonb;
  v_id     uuid;
  v_qty    numeric;
  v_item   uuid;
begin
  perform require_admin();
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty  := coalesce((it->>'quantity')::numeric, 0);
    v_item := (it->>'item_id')::uuid;
    if v_qty <= 0 then continue; end if;

    update bunker_stock
      set quantity = greatest(0, quantity - v_qty)
      where warehouse_id = p_warehouse and item_id = v_item;

    insert into bunker_unit_stock (unit, item_id, quantity)
    values (p_unit, v_item, v_qty)
    on conflict (unit, item_id)
    do update set quantity = bunker_unit_stock.quantity + excluded.quantity;
  end loop;

  insert into bunker_dispenses (warehouse_id, unit, person, items, performed_by)
  values (p_warehouse, p_unit, p_person, p_items, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function bunker_apply_credit(
  p_unit      text,
  p_warehouse uuid,
  p_receiver  text,
  p_items     jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  it       jsonb;
  v_id     uuid;
  v_qty    numeric;
  v_item   uuid;
begin
  perform require_admin();
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty  := coalesce((it->>'quantity')::numeric, 0);
    v_item := (it->>'item_id')::uuid;
    if v_qty <= 0 then continue; end if;

    insert into bunker_stock (warehouse_id, item_id, quantity)
    values (p_warehouse, v_item, v_qty)
    on conflict (warehouse_id, item_id)
    do update set quantity = bunker_stock.quantity + excluded.quantity;

    update bunker_unit_stock
      set quantity = greatest(0, quantity - v_qty)
      where unit = p_unit and item_id = v_item;
  end loop;

  insert into bunker_credits (unit, warehouse_id, receiver, items, performed_by)
  values (p_unit, p_warehouse, p_receiver, p_items, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function bunker_apply_transfer(
  p_origin      uuid,
  p_destination uuid,
  p_in_charge   text,
  p_items       jsonb
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
  perform require_admin();
  if p_origin = p_destination then
    raise exception 'origin and destination warehouses must differ';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty  := coalesce((it->>'quantity')::numeric, 0);
    v_item := (it->>'item_id')::uuid;
    if v_qty <= 0 then continue; end if;

    update bunker_stock
      set quantity = greatest(0, quantity - v_qty)
      where warehouse_id = p_origin and item_id = v_item;

    insert into bunker_stock (warehouse_id, item_id, quantity)
    values (p_destination, v_item, v_qty)
    on conflict (warehouse_id, item_id)
    do update set quantity = bunker_stock.quantity + excluded.quantity;
  end loop;

  insert into bunker_transfers (origin_warehouse_id, destination_warehouse_id, in_charge, items, performed_by)
  values (p_origin, p_destination, p_in_charge, p_items, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function bunker_apply_regulation(
  p_warehouse uuid,
  p_target    text,
  p_performer text,
  p_items     jsonb
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
  perform require_admin();
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty  := coalesce((it->>'quantity')::numeric, 0);
    v_item := (it->>'item_id')::uuid;
    if v_qty <= 0 then continue; end if;

    update bunker_stock
      set quantity = greatest(0, quantity - v_qty)
      where warehouse_id = p_warehouse and item_id = v_item;
  end loop;

  insert into bunker_regulations (warehouse_id, target, performer, items, performed_by)
  values (p_warehouse, p_target, p_performer, p_items, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;
