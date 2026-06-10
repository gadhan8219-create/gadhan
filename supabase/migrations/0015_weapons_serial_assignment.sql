-- 0015_weapons_serial_assignment.sql
-- Track which soldier currently holds each weapons serial.
-- assigned_to_pn = NULL means the serial is available.

alter table weapons_item_serials
  add column if not exists assigned_to_pn   text,
  add column if not exists assigned_to_name text,
  add column if not exists assigned_at      timestamptz;

create index if not exists weapons_serials_assigned_idx on weapons_item_serials(assigned_to_pn);
