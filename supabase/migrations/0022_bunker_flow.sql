-- 0022_bunker_flow.sql
-- Bunker screens 3 (ניפוק / dispense) and 4 (זיכוי / credit).
--
-- Dispense moves ammo from a warehouse out to a unit; credit returns it from a
-- unit back to a warehouse. Per-unit balances are tracked in bunker_unit_stock.
-- Units are a fixed text list (see BUNKER_UNITS in src/lib/bunker.ts), kept
-- separate from the org-wide `units` table on purpose.

-- ── Per-unit stock (תחמושת מסגרות) ───────────────────────────────────────────
create table if not exists bunker_unit_stock (
  unit     text not null,
  item_id  uuid not null references bunker_items(id) on delete cascade,
  quantity numeric not null default 0,
  primary key (unit, item_id)
);
create index if not exists bunker_unit_stock_unit_idx on bunker_unit_stock(unit);

-- ── Dispenses log (ניפוקים) ──────────────────────────────────────────────────
create table if not exists bunker_dispenses (
  id            uuid primary key default gen_random_uuid(),
  warehouse_id  uuid not null references bunker_warehouses(id) on delete cascade,
  unit          text not null,
  person        text not null,
  items         jsonb not null default '[]'::jsonb,
  dispensed_at  timestamptz not null default now(),
  performed_by  uuid references profiles(id)
);
create index if not exists bunker_dispenses_unit_idx on bunker_dispenses(unit);
create index if not exists bunker_dispenses_date_idx on bunker_dispenses(dispensed_at desc);

-- ── Credits log (זיכויים) ────────────────────────────────────────────────────
create table if not exists bunker_credits (
  id            uuid primary key default gen_random_uuid(),
  unit          text not null,
  warehouse_id  uuid not null references bunker_warehouses(id) on delete cascade,
  receiver      text not null,
  items         jsonb not null default '[]'::jsonb,
  credited_at   timestamptz not null default now(),
  performed_by  uuid references profiles(id)
);
create index if not exists bunker_credits_unit_idx on bunker_credits(unit);
create index if not exists bunker_credits_date_idx on bunker_credits(credited_at desc);

-- ── Apply-dispense RPC ───────────────────────────────────────────────────────
-- Removes quantities from the warehouse (floored at 0) and adds them onto the
-- unit balance, then logs the dispense. Returns the new dispense id.
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

-- ── Apply-credit RPC ─────────────────────────────────────────────────────────
-- Returns quantities from a unit back to a warehouse. Over-return is allowed:
-- the warehouse gains the full returned amount; the unit balance is floored at 0.
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

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table bunker_unit_stock enable row level security;
alter table bunker_dispenses  enable row level security;
alter table bunker_credits    enable row level security;

drop policy if exists bunker_unit_stock_all on bunker_unit_stock;
drop policy if exists bunker_dispenses_all  on bunker_dispenses;
drop policy if exists bunker_credits_all    on bunker_credits;
create policy bunker_unit_stock_all on bunker_unit_stock for all to authenticated using (true) with check (true);
create policy bunker_dispenses_all  on bunker_dispenses  for all to authenticated using (true) with check (true);
create policy bunker_credits_all    on bunker_credits    for all to authenticated using (true) with check (true);

-- ── Grants ───────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.bunker_unit_stock to authenticated;
grant select, insert, update, delete on public.bunker_dispenses   to authenticated;
grant select, insert, update, delete on public.bunker_credits     to authenticated;
grant execute on function bunker_apply_dispense(uuid, text, text, jsonb) to authenticated;
grant execute on function bunker_apply_credit(text, uuid, text, jsonb)   to authenticated;
