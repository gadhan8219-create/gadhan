-- 0027_vehicles.sql
-- רכב — vehicle registry per unit.
--   vehicle_types : kinds of vehicle (יר״מ / לבן / צבאי), seeded below.
--   vehicles      : one row per vehicle, tied to a unit + type, with uploaded
--                   documents (יר״מ form, license) and the next-test reminder
--                   (by date or by kilometrage).

-- ── Vehicle types (סוג הרכב) ─────────────────────────────────────────────────
create table if not exists vehicle_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);
insert into vehicle_types (name) values ('יר״מ'), ('לבן'), ('צבאי')
  on conflict (name) do nothing;

-- ── Vehicles (רכב למסגרת) ────────────────────────────────────────────────────
create table if not exists vehicles (
  id              uuid primary key default gen_random_uuid(),
  car_plate       text not null,                  -- מספר רכב (יר״מ/לבן) או צ׳ (צבאי)
  unit_id         uuid references units(id) on delete set null,
  type_id         uuid not null references vehicle_types(id),
  documents       jsonb not null default '[]'::jsonb,  -- [{ name, url, uploaded_at }]
  next_test_date  date,                           -- בדיקה הבאה לפי תאריך
  next_test_range integer,                        -- בדיקה הבאה לפי קילומטרז׳
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists vehicles_type_idx on vehicles(type_id);
create index if not exists vehicles_unit_idx on vehicles(unit_id);
create index if not exists vehicles_next_test_idx on vehicles(next_test_date);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table vehicle_types enable row level security;
alter table vehicles      enable row level security;
drop policy if exists vehicle_types_all on vehicle_types;
drop policy if exists vehicles_all      on vehicles;
create policy vehicle_types_all on vehicle_types for all to authenticated using (true) with check (true);
create policy vehicles_all      on vehicles      for all to authenticated using (true) with check (true);

-- ── Grants ───────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.vehicle_types to authenticated;
grant select, insert, update, delete on public.vehicles      to authenticated;

-- ── Documents storage bucket (public; unguessable path security model) ──────
insert into storage.buckets (id, name, public)
  values ('vehicle-docs', 'vehicle-docs', true)
  on conflict (id) do nothing;

drop policy if exists vehicle_docs_insert on storage.objects;
create policy vehicle_docs_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'vehicle-docs');

drop policy if exists vehicle_docs_update on storage.objects;
create policy vehicle_docs_update on storage.objects
  for update to authenticated using (bucket_id = 'vehicle-docs');

drop policy if exists vehicle_docs_read on storage.objects;
create policy vehicle_docs_read on storage.objects
  for select using (bucket_id = 'vehicle-docs');
