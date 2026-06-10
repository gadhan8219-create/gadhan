-- 0014_weapons_items.sql
-- Dedicated weapons module tables — completely separate from radio (items / item_serials).
-- has_serials = true  → track individual serial numbers via weapons_item_serials
-- has_serials = false → track total quantity on the item row itself

create table if not exists weapons_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  has_serials boolean not null default true,
  quantity    integer,          -- used when has_serials = false
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists weapons_item_serials (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references weapons_items(id) on delete cascade,
  serial_number text not null,
  created_at    timestamptz not null default now(),
  unique (item_id, serial_number)
);

create index if not exists weapons_item_serials_item_idx on weapons_item_serials(item_id);

-- RLS
alter table weapons_items enable row level security;
alter table weapons_item_serials enable row level security;

create policy weapons_items_select   on weapons_items         for select using (true);
create policy weapons_items_write    on weapons_items         for all    using (is_admin()) with check (is_admin());
create policy weapons_serials_select on weapons_item_serials  for select using (true);
create policy weapons_serials_write  on weapons_item_serials  for all    using (is_admin()) with check (is_admin());

-- Grants
grant select, insert, update, delete on public.weapons_items        to authenticated;
grant select, insert, update, delete on public.weapons_item_serials to authenticated;
