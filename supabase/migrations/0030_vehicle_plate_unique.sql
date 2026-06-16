-- 0030_vehicle_plate_unique.sql
-- Prevent duplicate car plates in the vehicle registry.
--
-- The app also checks before inserting (lib/vehicles.ts → createVehicle), but
-- that check only sees rows the caller's RLS allows. This unique index is the
-- authoritative guard across ALL units. The insert path translates a 23505
-- unique-violation into the Hebrew message "מספר רכב כבר קיים במערכת".
--
-- Plates are stored trimmed (createVehicle trims before insert). If this index
-- fails to create, the table already contains duplicate car_plate values — find
-- and resolve them first:
--   select car_plate, count(*) from public.vehicles
--   group by car_plate having count(*) > 1;

create unique index if not exists vehicles_car_plate_unique
  on public.vehicles (car_plate);
