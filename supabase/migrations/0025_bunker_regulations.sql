-- 0025_bunker_regulations.sql
-- Bunker screen 6 (וויסותים / regulations) — ammo leaving the unit entirely,
-- out to external parties. Decrements the source warehouse; nothing is added
-- back anywhere (unlike a transfer).

-- ── Regulations log (וויסותים) ───────────────────────────────────────────────
create table if not exists bunker_regulations (
  id             uuid primary key default gen_random_uuid(),
  warehouse_id   uuid not null references bunker_warehouses(id) on delete cascade,
  target         text not null,
  performer      text not null,
  items          jsonb not null default '[]'::jsonb,
  regulated_at   timestamptz not null default now(),
  performed_by   uuid references profiles(id)
);
create index if not exists bunker_regulations_wh_idx   on bunker_regulations(warehouse_id);
create index if not exists bunker_regulations_date_idx on bunker_regulations(regulated_at desc);

-- ── Apply-regulation RPC ─────────────────────────────────────────────────────
-- Removes quantities from the warehouse (floored at 0) and logs the regulation.
-- Returns the new regulation id.
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

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table bunker_regulations enable row level security;
drop policy if exists bunker_regulations_all on bunker_regulations;
create policy bunker_regulations_all on bunker_regulations for all to authenticated using (true) with check (true);

-- ── Grants ───────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.bunker_regulations to authenticated;
grant execute on function bunker_apply_regulation(uuid, text, text, jsonb) to authenticated;
