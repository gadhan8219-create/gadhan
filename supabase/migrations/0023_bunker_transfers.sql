-- 0023_bunker_transfers.sql
-- Bunker screen 5 (העברה / transfer) — internal moves between warehouses.

-- ── Transfers log (העברות) ───────────────────────────────────────────────────
create table if not exists bunker_transfers (
  id                     uuid primary key default gen_random_uuid(),
  origin_warehouse_id    uuid not null references bunker_warehouses(id) on delete cascade,
  destination_warehouse_id uuid not null references bunker_warehouses(id) on delete cascade,
  in_charge              text not null,
  items                  jsonb not null default '[]'::jsonb,
  transferred_at         timestamptz not null default now(),
  performed_by           uuid references profiles(id)
);
create index if not exists bunker_transfers_origin_idx on bunker_transfers(origin_warehouse_id);
create index if not exists bunker_transfers_date_idx   on bunker_transfers(transferred_at desc);

-- ── Apply-transfer RPC ───────────────────────────────────────────────────────
-- Removes quantities from the origin warehouse (floored at 0) and adds them onto
-- the destination warehouse, then logs the transfer. Returns the new transfer id.
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

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table bunker_transfers enable row level security;
create policy bunker_transfers_all on bunker_transfers for all to authenticated using (true) with check (true);

-- ── Grants ───────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.bunker_transfers to authenticated;
grant execute on function bunker_apply_transfer(uuid, uuid, text, jsonb) to authenticated;
