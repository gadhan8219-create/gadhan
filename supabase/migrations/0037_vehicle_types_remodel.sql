-- 0037_vehicle_types_remodel.sql
-- Remodel the vehicle module per product decision (2026-06-17):
--   * vehicle_types is no longer the 3 fixed categories (יר״מ/לבן/צבאי). It is now
--     a CATALOG of vehicle models — each row is a model (name) that belongs to a
--     category (type) and declares whether it needs uploaded documents (license).
--   * vehicles gains `mileage` (קילומטרג׳ נוכחי). vehicles.type_id now points at a
--     catalog model row (which carries the name + category + license flag).
--
-- Clean-slate per product decision: existing vehicle_types rows are the old
-- categories and existing vehicles reference them, so both are emptied. Old
-- documents in the vehicle-docs bucket are left as harmless orphans.

-- ── Clean slate ──────────────────────────────────────────────────────────────
delete from vehicles;
delete from vehicle_types;

-- ── vehicle_types: model catalog ─────────────────────────────────────────────
-- Drop the old unique-on-name (a model name may repeat across categories).
alter table vehicle_types drop constraint if exists vehicle_types_name_key;

alter table vehicle_types add column if not exists type    text;
alter table vehicle_types add column if not exists license boolean not null default false;

-- type (category) is required and constrained to the three known categories.
alter table vehicle_types alter column type set not null;
alter table vehicle_types drop constraint if exists vehicle_types_type_chk;
alter table vehicle_types add  constraint vehicle_types_type_chk
  check (type in ('יר״מ', 'לבן', 'צבאי'));

-- A model name is unique within its category.
create unique index if not exists vehicle_types_name_type_unique
  on vehicle_types (name, type);
create index if not exists vehicle_types_type_idx on vehicle_types (type);

-- ── vehicles: current mileage ────────────────────────────────────────────────
alter table vehicles add column if not exists mileage integer;  -- קילומטרג׳ נוכחי
