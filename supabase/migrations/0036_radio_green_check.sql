-- 0036_radio_green_check.sql
-- "ירוק בעיניים" for the radio (קשר) module. The weapons module already has
-- weapons_item_serials.green_check_at; the radio module's item_serials only had
-- last_inspected_at. Add a parallel green_check_at, bumped on every signing/return
-- (set client-side in SignFormPage), and expose it through item_serial_status so
-- the inspection report can show it.

alter table item_serials add column if not exists green_check_at timestamptz;

-- Recreate the status view with green_check_at added (otherwise PostgREST can't
-- read it through the view). Body identical to 0013 except the new column.
drop view if exists item_serial_status;
create or replace view item_serial_status as
with unit_flows as (
  select usi.item_id, usi.serial_number, us.unit_id,
    sum(case when usi.action = 'issued' then usi.quantity else 0 end) -
    sum(case when usi.action = 'returned' then usi.quantity else 0 end) as net
  from unit_signing_items usi
  join unit_signings us on us.id = usi.unit_signing_id
  where usi.serial_number is not null
  group by usi.item_id, usi.serial_number, us.unit_id
),
soldier_flows as (
  select si.item_id, si.serial_number, s.soldier_id,
    sum(case when si.action = 'issued' then si.quantity else 0 end) -
    sum(case when si.action = 'returned' then si.quantity else 0 end) as net
  from signing_items si
  join signings s on s.id = si.signing_id
  where si.serial_number is not null
  group by si.item_id, si.serial_number, s.soldier_id
)
select
  s.id as serial_id,
  s.item_id,
  s.serial_number,
  s.last_inspected_at,
  s.green_check_at,
  (
    select f.unit_id from unit_flows f
    where f.item_id = s.item_id and f.serial_number = s.serial_number and f.net > 0
    limit 1
  ) as current_unit_id,
  (
    select f.soldier_id from soldier_flows f
    where f.item_id = s.item_id and f.serial_number = s.serial_number and f.net > 0
    limit 1
  ) as current_soldier_id
from item_serials s;
