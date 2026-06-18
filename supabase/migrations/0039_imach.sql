-- 0039_imach.sql — ניהול ימ״ח (יחידת מחסני חירום) + מכולות + תיקי לוחם.
--   storage_category     — קטגוריות פריט
--   storage_items        — פריטים (קטגוריה, יחידת מידה, תקן, האם בסיכום)
--   storage_by_unit      — ימ״ח (אחד למסגרת)
--   substorage_by_unit   — מכולה (אחת למסגרת)
--   storage              — תכולת ימ״ח/מכולה: פריט × כמות (בדיוק אחד מ-ימ״ח/מכולה)
--   bags                 — תקן תיק לוחם גדודי (פריט × כמות נדרשת)
--   soldier_bags         — תיק בפועל לחייל (או תיק גנרי למסגרת): פריט × כמות

-- ── קטגוריות ─────────────────────────────────────────────────────────────────
create table if not exists storage_category (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);
insert into storage_category (name)
  values ('קליר'), ('קרביץ'), ('חד״פ'), ('ציוד לחימה'), ('ציוד תרומה')
  on conflict (name) do nothing;

-- ── פריטים ───────────────────────────────────────────────────────────────────
create table if not exists storage_items (
  id                  uuid primary key default gen_random_uuid(),
  storage_category_id uuid references storage_category(id) on delete set null,
  name                text not null,
  uom                 text,                              -- יחידת מידה
  required            numeric,                           -- תקן (admin בלבד)
  in_sum              boolean not null default false,    -- האם לכלול בטבלת הסיכום
  created_at          timestamptz not null default now()
);
create index if not exists storage_items_cat_idx on storage_items(storage_category_id);

-- ── ימ״ח / מכולה (אחד לכל מסגרת) ──────────────────────────────────────────────
create table if not exists storage_by_unit (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null unique references units(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists substorage_by_unit (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null unique references units(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ── תכולת ימ״ח/מכולה ─────────────────────────────────────────────────────────
create table if not exists storage (
  id                    uuid primary key default gen_random_uuid(),
  storage_by_unit_id    uuid references storage_by_unit(id) on delete cascade,
  substorage_by_unit_id uuid references substorage_by_unit(id) on delete cascade,
  storage_item_id       uuid not null references storage_items(id) on delete cascade,
  quantity              numeric not null default 0,
  created_at            timestamptz not null default now(),
  -- בדיוק אחד מ-ימ״ח/מכולה מאוכלס
  constraint storage_one_target check ((storage_by_unit_id is not null) <> (substorage_by_unit_id is not null))
);
create index if not exists storage_sbu_idx  on storage(storage_by_unit_id);
create index if not exists storage_ssbu_idx on storage(substorage_by_unit_id);

-- ── תקן תיק לוחם גדודי ────────────────────────────────────────────────────────
create table if not exists bags (
  id              uuid primary key default gen_random_uuid(),
  storage_item_id uuid not null unique references storage_items(id) on delete cascade,
  required        numeric not null default 0,
  created_at      timestamptz not null default now()
);

-- ── תיק לוחם בפועל (חייל / תיק גנרי) ──────────────────────────────────────────
create table if not exists soldier_bags (
  id              uuid primary key default gen_random_uuid(),
  soldier_id      uuid references soldiers(id) on delete cascade,   -- NULL = תיק גנרי
  unit_id         uuid not null references units(id) on delete cascade,
  storage_item_id uuid not null references storage_items(id) on delete cascade,
  quantity        numeric not null default 0,
  bag_label       text,                                             -- שם התיק הגנרי
  created_at      timestamptz not null default now()
);
create index if not exists soldier_bags_unit_idx    on soldier_bags(unit_id);
create index if not exists soldier_bags_soldier_idx on soldier_bags(soldier_id);

-- ── RLS (פתוח; סקופ בצד הלקוח) ────────────────────────────────────────────────
alter table storage_category    enable row level security;
alter table storage_items       enable row level security;
alter table storage_by_unit     enable row level security;
alter table substorage_by_unit  enable row level security;
alter table storage             enable row level security;
alter table bags                enable row level security;
alter table soldier_bags        enable row level security;

drop policy if exists storage_category_all   on storage_category;
drop policy if exists storage_items_all      on storage_items;
drop policy if exists storage_by_unit_all    on storage_by_unit;
drop policy if exists substorage_by_unit_all on substorage_by_unit;
drop policy if exists storage_all            on storage;
drop policy if exists bags_all               on bags;
drop policy if exists soldier_bags_all       on soldier_bags;

create policy storage_category_all   on storage_category   for all to authenticated using (true) with check (true);
create policy storage_items_all      on storage_items      for all to authenticated using (true) with check (true);
create policy storage_by_unit_all    on storage_by_unit    for all to authenticated using (true) with check (true);
create policy substorage_by_unit_all on substorage_by_unit for all to authenticated using (true) with check (true);
create policy storage_all            on storage            for all to authenticated using (true) with check (true);
create policy bags_all               on bags               for all to authenticated using (true) with check (true);
create policy soldier_bags_all       on soldier_bags       for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.storage_category    to authenticated;
grant select, insert, update, delete on public.storage_items       to authenticated;
grant select, insert, update, delete on public.storage_by_unit      to authenticated;
grant select, insert, update, delete on public.substorage_by_unit  to authenticated;
grant select, insert, update, delete on public.storage             to authenticated;
grant select, insert, update, delete on public.bags                to authenticated;
grant select, insert, update, delete on public.soldier_bags        to authenticated;
