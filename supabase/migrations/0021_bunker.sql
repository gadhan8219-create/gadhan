-- 0021_bunker.sql
-- Bunker (בונקר) ammunition module — warehouses, items, per-warehouse stock,
-- and a receipts log of ammo coming in from external sources.
--
-- Screens 1 (מלאי) and 2 (קבלות) are wired against these tables. The remaining
-- bunker screens (dispense/credit/transfer/regulate/shatsal/summary) are still
-- UI-only and do not touch this schema yet.

-- ── Warehouses (מחסנים) ──────────────────────────────────────────────────────
create table if not exists bunker_warehouses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- ── Items (פריטים) ───────────────────────────────────────────────────────────
create table if not exists bunker_items (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- ── Per-warehouse stock (מלאי מחסנים) ────────────────────────────────────────
create table if not exists bunker_stock (
  warehouse_id uuid not null references bunker_warehouses(id) on delete cascade,
  item_id      uuid not null references bunker_items(id)      on delete cascade,
  quantity     numeric not null default 0,
  primary key (warehouse_id, item_id)
);
create index if not exists bunker_stock_wh_idx on bunker_stock(warehouse_id);

-- ── Receipts log (קבלות) ─────────────────────────────────────────────────────
-- items: jsonb array of { item_id, name, quantity } captured at receipt time.
create table if not exists bunker_receipts (
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references bunker_warehouses(id) on delete cascade,
  receiver     text not null,
  source       text,
  items        jsonb not null default '[]'::jsonb,
  received_at  timestamptz not null default now(),
  performed_by uuid references profiles(id)
);
create index if not exists bunker_receipts_wh_idx   on bunker_receipts(warehouse_id);
create index if not exists bunker_receipts_date_idx on bunker_receipts(received_at desc);

-- ── Apply-receipt RPC ────────────────────────────────────────────────────────
-- Atomically adds the received quantities onto bunker_stock (insert-or-increment)
-- and writes the receipt row. Returns the new receipt id.
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

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table bunker_warehouses enable row level security;
alter table bunker_items      enable row level security;
alter table bunker_stock      enable row level security;
alter table bunker_receipts   enable row level security;

-- Bunker management is available to any logged-in user (no admin gate in the UI).
create policy bunker_warehouses_all on bunker_warehouses for all to authenticated using (true) with check (true);
create policy bunker_items_all      on bunker_items      for all to authenticated using (true) with check (true);
create policy bunker_stock_all      on bunker_stock      for all to authenticated using (true) with check (true);
create policy bunker_receipts_all   on bunker_receipts   for all to authenticated using (true) with check (true);

-- ── Grants ───────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.bunker_warehouses to authenticated;
grant select, insert, update, delete on public.bunker_items      to authenticated;
grant select, insert, update, delete on public.bunker_stock      to authenticated;
grant select, insert, update, delete on public.bunker_receipts   to authenticated;
grant execute on function bunker_apply_receipt(uuid, text, text, jsonb) to authenticated;
