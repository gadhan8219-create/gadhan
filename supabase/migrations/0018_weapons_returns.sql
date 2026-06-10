-- 0018_weapons_returns.sql
-- Persistent log of every weapon return (זיכוי).
--
-- Why: the זיכויים PDF must be CUMULATIVE — it lists every item a soldier has
-- ever returned, not just the items credited in the current action. Clearing
-- `assigned_to_pn` on weapons_item_serials erases the only trace of a holding,
-- so without this table there is no source of truth for "all returns so far".
--
-- One row per (soldier, item/serial) returned. For non-serial quantity items
-- the serial is NULL (one row per returned unit).

create table if not exists weapons_returns (
  id            uuid primary key default gen_random_uuid(),
  soldier_pn    text not null,
  soldier_name  text,
  unit_name     text,
  item_name     text not null,
  serial        text,                       -- NULL for non-serial (quantity) items
  performed_by  uuid references profiles(id),
  returned_at   timestamptz not null default now()
);

create index if not exists weapons_returns_soldier_idx on weapons_returns(soldier_pn);

-- RLS — mirror the weapons module (admin-only writes, readable by authenticated)
alter table weapons_returns enable row level security;

create policy weapons_returns_select on weapons_returns for select using (true);
create policy weapons_returns_write  on weapons_returns for all    using (is_admin()) with check (is_admin());

-- Grants (0017 default privileges already cover future tables, but be explicit)
grant select, insert, update, delete on public.weapons_returns to authenticated;
