-- 0016_weapons_zeroed_flag.sql
-- Add is_zeroed flag to weapons_item_serials.
-- When is_zeroed = true, the serial is still assigned to a soldier
-- but marked as having been through an "איפסון" (inspection zeroing) process.

alter table weapons_item_serials
  add column if not exists is_zeroed boolean not null default false,
  add column if not exists zeroed_at timestamptz;

create index if not exists weapons_serials_zeroed_idx on weapons_item_serials(is_zeroed);
