-- gadhan-all full schema — 2026-06-10
-- Run this once in Supabase SQL Editor to initialize the DB

-- ═══════════════════════════════════════════
-- Migration: 0001_init.sql
-- ═══════════════════════════════════════════
-- gadhan-radio — initial schema
-- Run via Supabase SQL editor or `supabase db push`.
-- Idempotent where reasonable; safe to re-run during early development.

-- =========================================
-- Extensions
-- =========================================
create extension if not exists "pgcrypto";

-- =========================================
-- Enums
-- =========================================
do $$ begin
  create type role_t as enum ('admin', 'raspar');
exception when duplicate_object then null; end $$;

do $$ begin
  create type signing_type_t as enum ('signing', 'return', 'inspection');
exception when duplicate_object then null; end $$;

do $$ begin
  create type item_action_t as enum ('issued', 'returned', 'inspected');
exception when duplicate_object then null; end $$;

-- =========================================
-- Tables
-- =========================================
create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Profile is keyed to auth.users.id and lives alongside Supabase Auth.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role role_t not null default 'raspar',
  unit_id uuid references units(id) on delete set null,
  phone text,
  personal_number text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists soldiers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  personal_number text not null unique,
  phone text,
  unit_id uuid not null references units(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists signings (
  id uuid primary key default gen_random_uuid(),
  soldier_id uuid not null references soldiers(id) on delete restrict,
  performed_by uuid not null references profiles(id) on delete restrict,
  unit_id uuid not null references units(id) on delete restrict,
  type signing_type_t not null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists signings_soldier_idx on signings(soldier_id);
create index if not exists signings_unit_idx on signings(unit_id);
create index if not exists signings_created_idx on signings(created_at desc);

create table if not exists signing_items (
  id uuid primary key default gen_random_uuid(),
  signing_id uuid not null references signings(id) on delete cascade,
  item_id uuid not null references items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  action item_action_t not null
);
create index if not exists signing_items_signing_idx on signing_items(signing_id);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  performed_by uuid references profiles(id) on delete set null,
  target_type text,
  target_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on audit_logs(created_at desc);
create index if not exists audit_logs_action_idx on audit_logs(action);

-- =========================================
-- Helper functions for RLS
-- =========================================
create or replace function current_role_t() returns role_t
language sql stable security definer as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function current_unit_id() returns uuid
language sql stable security definer as $$
  select unit_id from profiles where id = auth.uid();
$$;

create or replace function is_admin() returns boolean
language sql stable security definer as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and active);
$$;

-- =========================================
-- RLS
-- =========================================
alter table units enable row level security;
alter table profiles enable row level security;
alter table soldiers enable row level security;
alter table items enable row level security;
alter table signings enable row level security;
alter table signing_items enable row level security;
alter table audit_logs enable row level security;

-- units: admin = all, raspar = read all
drop policy if exists units_select on units;
create policy units_select on units for select using (auth.role() = 'authenticated');
drop policy if exists units_admin_write on units;
create policy units_admin_write on units for all using (is_admin()) with check (is_admin());

-- profiles: each user reads own; admin reads/writes all
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles for select using (id = auth.uid() or is_admin());
drop policy if exists profiles_admin_write on profiles;
create policy profiles_admin_write on profiles for all using (is_admin()) with check (is_admin());

-- soldiers: admin = all, raspar = scoped to own unit (read + write)
drop policy if exists soldiers_select on soldiers;
create policy soldiers_select on soldiers for select using (
  is_admin() or unit_id = current_unit_id()
);
drop policy if exists soldiers_admin_write on soldiers;
create policy soldiers_admin_write on soldiers for all using (is_admin()) with check (is_admin());
drop policy if exists soldiers_raspar_insert on soldiers;
create policy soldiers_raspar_insert on soldiers for insert
  with check (current_role_t() = 'raspar' and unit_id = current_unit_id());
drop policy if exists soldiers_raspar_update on soldiers;
create policy soldiers_raspar_update on soldiers for update
  using (current_role_t() = 'raspar' and unit_id = current_unit_id())
  with check (current_role_t() = 'raspar' and unit_id = current_unit_id());

-- items: everyone reads, admin writes
drop policy if exists items_select on items;
create policy items_select on items for select using (auth.role() = 'authenticated');
drop policy if exists items_admin_write on items;
create policy items_admin_write on items for all using (is_admin()) with check (is_admin());

-- signings: admin all, raspar read all in unit + insert in unit
drop policy if exists signings_select on signings;
create policy signings_select on signings for select using (
  is_admin() or unit_id = current_unit_id()
);
drop policy if exists signings_admin_write on signings;
create policy signings_admin_write on signings for all using (is_admin()) with check (is_admin());
drop policy if exists signings_raspar_insert on signings;
create policy signings_raspar_insert on signings for insert
  with check (
    current_role_t() = 'raspar'
    and unit_id = current_unit_id()
    and performed_by = auth.uid()
  );

-- signing_items: visibility follows parent signing
drop policy if exists signing_items_select on signing_items;
create policy signing_items_select on signing_items for select using (
  exists (
    select 1 from signings s
    where s.id = signing_items.signing_id
      and (is_admin() or s.unit_id = current_unit_id())
  )
);
drop policy if exists signing_items_admin_write on signing_items;
create policy signing_items_admin_write on signing_items for all
  using (is_admin()) with check (is_admin());
drop policy if exists signing_items_raspar_insert on signing_items;
create policy signing_items_raspar_insert on signing_items for insert
  with check (
    exists (
      select 1 from signings s
      where s.id = signing_items.signing_id
        and s.unit_id = current_unit_id()
        and s.performed_by = auth.uid()
    )
  );

-- audit_logs: admin reads all; raspar reads own actions
drop policy if exists audit_select on audit_logs;
create policy audit_select on audit_logs for select using (
  is_admin() or performed_by = auth.uid()
);
drop policy if exists audit_insert on audit_logs;
create policy audit_insert on audit_logs for insert
  with check (auth.role() = 'authenticated');

-- =========================================
-- Trigger: create profile row on auth.users insert (default role = raspar, inactive)
-- Admin must activate + assign unit before login is useful.
-- =========================================
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'raspar',
    false
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ═══════════════════════════════════════════
-- Migration: 0002_seed.sql
-- ═══════════════════════════════════════════
-- Seed reference data: common radio items + a few sample units.
-- Safe to re-run (uses on conflict).

insert into items (name, description) values
  ('מכשיר 624', 'מכשיר קשר 624'),
  ('מכשיר 91', 'מכשיר קשר 91'),
  ('עמוד אנטנה', null),
  ('מגבר', null),
  ('סוללה', null),
  ('מטען', null),
  ('דיבורית', null),
  ('כבל תכנות', null),
  ('כיסוי גומי', null),
  ('שלפ"ק', null)
on conflict (name) do nothing;

insert into units (name) values
  ('פלוגה א'),
  ('פלוגה ב'),
  ('פלוגה ג'),
  ('מסייעת')
on conflict (name) do nothing;

-- ============================================================
-- POST-DEPLOY: bootstrap your first admin
-- ============================================================
-- 1. Create the auth user from the Supabase dashboard:
--    Authentication > Users > Add user > "admin@example.com" + password
-- 2. Then run the following (replace the email):
--
-- update profiles
--   set role = 'admin', active = true, full_name = 'מנהל מערכת'
--   where id = (select id from auth.users where email = 'admin@example.com');
-- ============================================================

-- ═══════════════════════════════════════════
-- Migration: 0003_cron.sql
-- ═══════════════════════════════════════════
-- Daily cron — invokes the export-to-sheets Edge Function at 03:00 Asia/Jerusalem (00:00 UTC).
-- Requires the pg_cron and pg_net extensions (enable in Supabase dashboard ▸ Database ▸ Extensions).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace these with real values:
--   SUPABASE_URL          → your project URL (e.g. https://abcd.supabase.co)
--   SERVICE_ROLE_KEY      → from Project settings ▸ API. Keep secret.
-- The cleanest pattern is to store them in Vault and read them here. For brevity
-- this snippet uses literal values via current_setting that you set once:
--
--   alter database postgres set "app.supabase_url" = 'https://YOUR.supabase.co';
--   alter database postgres set "app.service_role_key" = 'eyJ...';
--
-- After setting, run this block:

select cron.schedule(
  'export-signings-daily',
  '0 0 * * *',  -- 00:00 UTC = 03:00 Asia/Jerusalem
  $$
    select net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/export-to-sheets',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := jsonb_build_object('trigger', 'cron')
    );
  $$
);

-- To remove later:
--   select cron.unschedule('export-signings-daily');

-- ═══════════════════════════════════════════
-- Migration: 0004_org_structure.sql
-- ═══════════════════════════════════════════
-- Replace seed units with the actual organizational structure.
-- Adds a `teams` sub-level for units that have one.
--
-- מבנה:
--   פלוגה א/ב/ג   → צוות 1/2/3 + מפל"ג
--   מפג"ד          → חפ"ק
--   פלס"ם          → רכב, לוגיסטיקה, טנ"א, תקשוב, מפל"ג
--   ניוד / מחס"ר / הדרכה / צמ"ה / תאג"ד   (ללא צוותים)

-- 1. Drop only unreferenced placeholder units (safe — won't break FKs).
delete from units
  where name = 'מסייעת'
    and not exists (select 1 from soldiers s where s.unit_id = units.id)
    and not exists (select 1 from signings g where g.unit_id = units.id)
    and not exists (select 1 from profiles p where p.unit_id = units.id);

-- 2. Insert the real top-level units (idempotent — keeps existing פלוגה א/ב/ג).
insert into units (name) values
  ('פלוגה א'),
  ('פלוגה ב'),
  ('פלוגה ג'),
  ('מפג"ד'),
  ('פלס"ם'),
  ('ניוד'),
  ('מחס"ר'),
  ('הדרכה'),
  ('צמ"ה'),
  ('תאג"ד')
on conflict (name) do nothing;

-- 3. Teams table — sub-unit under units.
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (unit_id, name)
);
create index if not exists teams_unit_idx on teams(unit_id);

-- 4. Seed teams.
do $$
declare u_id uuid;
begin
  for u_id in select id from units where name in ('פלוגה א', 'פלוגה ב', 'פלוגה ג') loop
    insert into teams (unit_id, name) values
      (u_id, 'צוות 1'),
      (u_id, 'צוות 2'),
      (u_id, 'צוות 3'),
      (u_id, 'מפל"ג')
    on conflict (unit_id, name) do nothing;
  end loop;

  select id into u_id from units where name = 'מפג"ד';
  if u_id is not null then
    insert into teams (unit_id, name) values (u_id, 'חפ"ק')
    on conflict (unit_id, name) do nothing;
  end if;

  select id into u_id from units where name = 'פלס"ם';
  if u_id is not null then
    insert into teams (unit_id, name) values
      (u_id, 'רכב'),
      (u_id, 'לוגיסטיקה'),
      (u_id, 'טנ"א'),
      (u_id, 'תקשוב'),
      (u_id, 'מפל"ג')
    on conflict (unit_id, name) do nothing;
  end if;
end $$;

-- 5. Optional team association for soldiers + signings.
alter table soldiers add column if not exists team_id uuid references teams(id) on delete set null;
alter table signings add column if not exists team_id uuid references teams(id) on delete set null;

-- 6. RLS for teams (read for all auth users, write for admin only).
alter table teams enable row level security;

drop policy if exists teams_select on teams;
create policy teams_select on teams for select using (auth.role() = 'authenticated');

drop policy if exists teams_admin_write on teams;
create policy teams_admin_write on teams for all using (is_admin()) with check (is_admin());

-- ═══════════════════════════════════════════
-- Migration: 0005_serial_numbers.sql
-- ═══════════════════════════════════════════
-- Add per-line serial number ("צ'") for tracking individual physical items.
-- Optional: not all items have serials (some are quantity-only).

alter table signing_items add column if not exists serial_number text;

create index if not exists signing_items_serial_idx
  on signing_items(item_id, serial_number)
  where serial_number is not null;

-- ═══════════════════════════════════════════
-- Migration: 0006_signing_pdf.sql
-- ═══════════════════════════════════════════
-- 0006_signing_pdf.sql
-- Track Google Drive PDF uploads per signing/soldier and cache per-unit Drive folder ids.

alter table signings
  add column if not exists pdf_drive_file_id text;

alter table soldiers
  add column if not exists pdf_drive_file_id text;

alter table units
  add column if not exists drive_folder_id text;

-- ═══════════════════════════════════════════
-- Migration: 0007_pdf_storage.sql
-- ═══════════════════════════════════════════
-- 0007_pdf_storage.sql
-- Switch signing PDFs from Google Drive to Supabase Storage.
-- Reason: SAs have no Drive quota, so uploads to a personal-Drive parent folder
-- always fail with 403 storageQuotaExceeded. Supabase Storage avoids this entirely.

-- 1. Public bucket — security model is "unguessable UUID path" (same as the
--    previous "anyone with the Drive link can view" model the user accepted).
insert into storage.buckets (id, name, public)
  values ('signing-pdfs', 'signing-pdfs', true)
  on conflict (id) do nothing;

-- service_role (used by the Edge Function) bypasses storage policies, so no
-- explicit upload policy is required. Public buckets serve reads to anon by
-- default, so no read policy is required either.

-- 2. Rename columns from the Drive era — the field now holds a full URL.
alter table soldiers rename column pdf_drive_file_id to pdf_url;
alter table signings rename column pdf_drive_file_id to pdf_url;

-- 3. Drop the now-unused Drive folder cache on units.
alter table units drop column if exists drive_folder_id;

-- ═══════════════════════════════════════════
-- Migration: 0008_username.sql
-- ═══════════════════════════════════════════
-- 0008_username.sql
-- Add a dedicated `username` field for login (English letters/digits/._-, unique).
-- Supabase Auth still requires an email; we generate it as `<username>@gadhan.local`
-- on user creation. The LoginPage accepts the username and appends the suffix.

alter table profiles add column if not exists username text;

-- Backfill existing profiles from their auth email prefix so nothing breaks.
update profiles p
  set username = split_part(u.email, '@', 1)
  from auth.users u
  where p.id = u.id and p.username is null;

-- Shape constraint — English letters, digits, dot/underscore/dash only, 3-32 chars.
-- Stored lowercase so comparisons are case-insensitive.
alter table profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9._-]{3,32}$');

-- Uniqueness (case-sensitive is fine because we normalize to lowercase in code).
create unique index if not exists profiles_username_unique on profiles (username);

-- ═══════════════════════════════════════════
-- Migration: 0009_unit_signings.sql
-- ═══════════════════════════════════════════
-- 0009_unit_signings.sql
-- Battalion → unit ("החתמת מסגרת") equipment allocation.
-- The battalion issues/returns equipment to an entire unit (מסגרת).
-- Raspar soldier-level signings then draw from that unit stock.
--
-- Stock math:
--   unit_stock(item, serial) = Σ issued  − Σ returned  (in unit_signing_items for that unit)
--   distributed(item, serial) = Σ issued − Σ returned  (in signing_items for signings in that unit)
--   available_for_raspar      = unit_stock − distributed
--
-- unit_signing_type reuses two of the existing signing_type_t variants
-- conceptually (signing / return) but has its own enum to keep the domains
-- clean in SQL (and leave room to diverge later, e.g. add 'audit').

do $$ begin
  create type unit_signing_type_t as enum ('signing', 'return');
exception when duplicate_object then null; end $$;

do $$ begin
  create type unit_item_action_t as enum ('issued', 'returned');
exception when duplicate_object then null; end $$;

create table if not exists unit_signings (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete restrict,
  performed_by uuid not null references profiles(id) on delete restrict,
  type unit_signing_type_t not null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists unit_signings_unit_idx on unit_signings(unit_id);
create index if not exists unit_signings_created_idx on unit_signings(created_at desc);

create table if not exists unit_signing_items (
  id uuid primary key default gen_random_uuid(),
  unit_signing_id uuid not null references unit_signings(id) on delete cascade,
  item_id uuid not null references items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  action unit_item_action_t not null,
  serial_number text
);
create index if not exists unit_signing_items_parent_idx on unit_signing_items(unit_signing_id);
create index if not exists unit_signing_items_item_idx on unit_signing_items(item_id);

-- =========================================
-- RLS
-- =========================================
alter table unit_signings enable row level security;
alter table unit_signing_items enable row level security;

-- Everyone authenticated can read their own unit's unit_signings (raspar needs
-- them to compute availability); admin reads everything.
drop policy if exists unit_signings_select on unit_signings;
create policy unit_signings_select on unit_signings for select using (
  is_admin() or unit_id = current_unit_id()
);

-- Only admin writes unit_signings (this is the battalion-level action).
drop policy if exists unit_signings_admin_write on unit_signings;
create policy unit_signings_admin_write on unit_signings for all
  using (is_admin()) with check (is_admin());

-- unit_signing_items: visibility follows parent.
drop policy if exists unit_signing_items_select on unit_signing_items;
create policy unit_signing_items_select on unit_signing_items for select using (
  exists (
    select 1 from unit_signings us
    where us.id = unit_signing_items.unit_signing_id
      and (is_admin() or us.unit_id = current_unit_id())
  )
);

drop policy if exists unit_signing_items_admin_write on unit_signing_items;
create policy unit_signing_items_admin_write on unit_signing_items for all
  using (is_admin()) with check (is_admin());

-- =========================================
-- Stock view (convenience for reports + SignForm availability checks)
-- =========================================
--
-- Per (unit_id, item_id, serial_number) rollup. Serial is normalized to ''
-- so aggregation is consistent with the app-side key format.
--
-- Columns:
--   unit_id, item_id, serial_number
--   allocated   — issued from battalion to unit
--   returned_up — returned from unit back to battalion
--   stock       — allocated − returned_up
--   distributed — currently held by soldiers in this unit (issued−returned in signings)
--   available   — stock − distributed  (what raspar can still hand out)
create or replace view unit_item_stock as
with unit_flows as (
  select
    us.unit_id,
    usi.item_id,
    coalesce(usi.serial_number, '') as serial_number,
    sum(case when usi.action = 'issued'   then usi.quantity else 0 end) as allocated,
    sum(case when usi.action = 'returned' then usi.quantity else 0 end) as returned_up
  from unit_signing_items usi
  join unit_signings us on us.id = usi.unit_signing_id
  group by us.unit_id, usi.item_id, coalesce(usi.serial_number, '')
),
soldier_flows as (
  select
    s.unit_id,
    si.item_id,
    coalesce(si.serial_number, '') as serial_number,
    sum(case when si.action = 'issued'   then si.quantity else 0 end)
      - sum(case when si.action = 'returned' then si.quantity else 0 end) as distributed
  from signing_items si
  join signings s on s.id = si.signing_id
  where si.action in ('issued', 'returned')
  group by s.unit_id, si.item_id, coalesce(si.serial_number, '')
)
select
  uf.unit_id,
  uf.item_id,
  nullif(uf.serial_number, '') as serial_number,
  uf.allocated,
  uf.returned_up,
  (uf.allocated - uf.returned_up) as stock,
  coalesce(sf.distributed, 0) as distributed,
  (uf.allocated - uf.returned_up - coalesce(sf.distributed, 0)) as available
from unit_flows uf
left join soldier_flows sf
  on sf.unit_id = uf.unit_id
 and sf.item_id = uf.item_id
 and sf.serial_number = uf.serial_number;

-- ═══════════════════════════════════════════
-- Migration: 0010_item_serials.sql
-- ═══════════════════════════════════════════
-- 0010_item_serials.sql
-- Master inventory catalog: every physical serial number the battalion owns.
-- Serves as the source of truth for:
--   - Admin "החתמת מסגרת": dropdown of serials available at battalion (not currently allocated to any unit)
--   - "Battalion inventory" visibility (future reports)
--
-- The existing `unit_signing_items.serial_number` still drives allocation math.
-- This table only constrains WHICH serials exist and can be picked.

create table if not exists item_serials (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  serial_number text not null,
  created_at timestamptz not null default now(),
  unique (item_id, serial_number)
);
create index if not exists item_serials_item_idx on item_serials(item_id);

alter table item_serials enable row level security;

drop policy if exists item_serials_select on item_serials;
create policy item_serials_select on item_serials for select using (auth.role() = 'authenticated');

drop policy if exists item_serials_admin_write on item_serials;
create policy item_serials_admin_write on item_serials for all using (is_admin()) with check (is_admin());

-- -----------------------------------------------------------------------------
-- Backfill: any serial previously typed ad-hoc into unit_signings / signings
-- should now appear in the master catalog so the UI's new strict dropdowns
-- won't hide legacy allocations.
-- -----------------------------------------------------------------------------
insert into item_serials (item_id, serial_number)
select distinct usi.item_id, usi.serial_number
from unit_signing_items usi
where usi.serial_number is not null
on conflict (item_id, serial_number) do nothing;

insert into item_serials (item_id, serial_number)
select distinct si.item_id, si.serial_number
from signing_items si
where si.serial_number is not null
on conflict (item_id, serial_number) do nothing;

-- -----------------------------------------------------------------------------
-- View: current location of every registered serial.
--
-- current_unit_id:
--   - null          → at battalion (not currently allocated to any unit)
--   - <unit uuid>   → allocated to that unit (net issued > 0 via unit_signings)
--
-- Note: a serial can only be at one unit at a time — a net-positive "issued"
-- in two units for the same serial is an operator error we don't try to
-- reconcile here. Admin will see both units claim it until a return is logged.
-- -----------------------------------------------------------------------------
create or replace view item_serial_status as
with ser_flows as (
  select
    usi.item_id,
    usi.serial_number,
    us.unit_id,
    sum(case when usi.action = 'issued'   then usi.quantity else 0 end) -
    sum(case when usi.action = 'returned' then usi.quantity else 0 end) as net
  from unit_signing_items usi
  join unit_signings us on us.id = usi.unit_signing_id
  where usi.serial_number is not null
  group by usi.item_id, usi.serial_number, us.unit_id
)
select
  s.id as serial_id,
  s.item_id,
  s.serial_number,
  (
    select f.unit_id
    from ser_flows f
    where f.item_id = s.item_id
      and f.serial_number = s.serial_number
      and f.net > 0
    limit 1
  ) as current_unit_id
from item_serials s;

-- ═══════════════════════════════════════════
-- Migration: 0011_item_category_bundles.sql
-- ═══════════════════════════════════════════
-- 0011_item_category_bundles.sql
-- 1) Add "category" (שיוך ארגוני) free-text tag to items.
-- 2) Introduce item bundles (ערכות): one item composed of N other items.
--    Used e.g. for "ערכת PRC-148" that contains transceiver + modem + CF.
--    The bundle itself is a regular row in `items`; the composition lives here.

alter table items add column if not exists category text;
create index if not exists items_category_idx on items(category);

create table if not exists item_bundle_components (
  id uuid primary key default gen_random_uuid(),
  bundle_item_id    uuid not null references items(id) on delete cascade,
  component_item_id uuid not null references items(id) on delete restrict,
  quantity int not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (bundle_item_id, component_item_id),
  -- An item cannot be a component of itself.
  check (bundle_item_id <> component_item_id)
);
create index if not exists item_bundle_components_bundle_idx on item_bundle_components(bundle_item_id);
create index if not exists item_bundle_components_component_idx on item_bundle_components(component_item_id);

alter table item_bundle_components enable row level security;

drop policy if exists item_bundle_components_select on item_bundle_components;
create policy item_bundle_components_select on item_bundle_components
  for select using (auth.role() = 'authenticated');

drop policy if exists item_bundle_components_admin_write on item_bundle_components;
create policy item_bundle_components_admin_write on item_bundle_components
  for all using (is_admin()) with check (is_admin());

-- ═══════════════════════════════════════════
-- Migration: 0012_drop_item_bundles.sql
-- ═══════════════════════════════════════════
-- 0012_drop_item_bundles.sql
-- Roll back the bundle feature from 0011 — we'll model kits differently.
-- Note: keeps items.category (that's still in use).

drop table if exists item_bundle_components;

-- ═══════════════════════════════════════════
-- Migration: 0013_serial_inspections.sql
-- ═══════════════════════════════════════════
-- 0013_serial_inspections.sql
-- Track "last inspected" timestamp per serial. Status is derived on the client:
--   - last_inspected_at null or older than 7 days → דרוש בדיקה
--   - within 7 days → נמצא
--
-- Raspar can mark serials that are currently at THEIR unit (allocated, not yet
-- returned to battalion). Admin can mark any serial.

alter table item_serials add column if not exists last_inspected_at timestamptz;
alter table item_serials add column if not exists last_inspected_by uuid references profiles(id);

-- Helper: does this (item, serial) currently sit at the given unit? Used both
-- by RLS and by the query that powers the inspection report.
create or replace function serial_currently_at_unit(p_item_id uuid, p_serial text, p_unit_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select coalesce(
    sum(case when usi.action = 'issued' then usi.quantity else 0 end) -
    sum(case when usi.action = 'returned' then usi.quantity else 0 end),
  0) > 0
  from unit_signing_items usi
  join unit_signings us on us.id = usi.unit_signing_id
  where usi.item_id = p_item_id
    and usi.serial_number = p_serial
    and us.unit_id = p_unit_id;
$$;

-- Enhance the status view: now includes current_soldier_id + last_inspected_at.
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

-- Allow raspar to UPDATE item_serials rows for serials currently at their unit.
-- The existing `item_serials_admin_write` FOR ALL policy still covers admins;
-- RLS OR's policies per command, so this only ADDS access — doesn't restrict.
drop policy if exists item_serials_raspar_inspect on item_serials;
create policy item_serials_raspar_inspect on item_serials
  for update
  using (
    is_admin()
    or serial_currently_at_unit(item_id, serial_number, current_unit_id())
  )
  with check (
    is_admin()
    or serial_currently_at_unit(item_id, serial_number, current_unit_id())
  );

