-- 0019_fuel.sql
-- Fuel-card module (תדלוק), ported from the standalone gadhan-delek GAS app.
--
-- Source of truth for live balance is the Goodi fuel-admin website, scraped by
-- the `fuel-goodi-lookup` edge function. The tables below cache the card roster
-- and log each fueling (receipt photo + driver). Liters are NOT entered by the
-- driver — they are synced from Goodi (refresh) into fuel_cards.liters_left.

-- ── Cards roster ────────────────────────────────────────────────────────────
create table if not exists fuel_cards (
  id             uuid primary key default gen_random_uuid(),
  card_number    text not null unique,
  card_name      text,                       -- imported from Goodi
  fuel_type      text,                       -- בנזין / סולר
  liters_left    numeric not null default 0, -- synced from Goodi
  notes          text,
  is_archived    boolean not null default false,
  is_empty       boolean not null default false,
  last_synced_at timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists fuel_cards_number_idx on fuel_cards(card_number);

-- ── Fueling log (one row per receipt submitted by a driver) ─────────────────
create table if not exists fuel_logs (
  id           uuid primary key default gen_random_uuid(),
  card_number  text not null,
  fuel_type    text,
  driver_name  text not null,
  receipt_url  text,
  performed_by uuid references profiles(id),
  created_at   timestamptz not null default now()
);
create index if not exists fuel_logs_card_idx on fuel_logs(card_number);
create index if not exists fuel_logs_created_idx on fuel_logs(created_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table fuel_cards enable row level security;
alter table fuel_logs  enable row level security;

-- Cards: anyone logged in can read (balance check / verify card); admin writes.
create policy fuel_cards_select on fuel_cards for select using (true);
create policy fuel_cards_write  on fuel_cards for all    using (is_admin()) with check (is_admin());

-- Logs: any logged-in user can record a fueling and read the log; admin manages.
create policy fuel_logs_select on fuel_logs for select using (true);
create policy fuel_logs_insert on fuel_logs for insert to authenticated with check (true);
create policy fuel_logs_admin  on fuel_logs for all    using (is_admin()) with check (is_admin());

-- ── Grants ──────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.fuel_cards to authenticated;
grant select, insert, update, delete on public.fuel_logs  to authenticated;

-- ── Receipts storage bucket (public; unguessable path security model) ───────
insert into storage.buckets (id, name, public)
  values ('fuel-receipts', 'fuel-receipts', true)
  on conflict (id) do nothing;

-- authenticated users upload receipts; public bucket serves reads by default.
drop policy if exists fuel_receipts_insert on storage.objects;
create policy fuel_receipts_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'fuel-receipts');

drop policy if exists fuel_receipts_read on storage.objects;
create policy fuel_receipts_read on storage.objects
  for select using (bucket_id = 'fuel-receipts');
