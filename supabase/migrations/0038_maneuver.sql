-- 0038_maneuver.sql — סעיף 15א: דרישות תמרון + כניסות/יציאות.
--   maneuver_categories   — קטגוריות דרישה (אוכל / לוגיסטיקה / תחמושת / חימוש …)
--   maneuver_requirements — דרישה אחת לשורה, משויכת למסגרת (+צוות אופציונלי) וקטגוריה
--   maneuver_entries      — רשימות כניסה/יציאה של חיילים לתאריך נתון (מחר)

-- ── קטגוריות דרישה ───────────────────────────────────────────────────────────
create table if not exists maneuver_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);
insert into maneuver_categories (name)
  values ('אוכל'), ('לוגיסטיקה'), ('תחמושת'), ('חימוש')
  on conflict (name) do nothing;

-- ── דרישות ───────────────────────────────────────────────────────────────────
create table if not exists maneuver_requirements (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references units(id) on delete cascade,
  team_id     uuid references teams(id) on delete set null,        -- אופציונלי
  category_id uuid not null references maneuver_categories(id) on delete cascade,
  requirement text not null,
  created_at  timestamptz not null default now()                   -- "תאריך"
);
create index if not exists maneuver_req_unit_idx on maneuver_requirements(unit_id);
create index if not exists maneuver_req_cat_idx  on maneuver_requirements(category_id);

-- ── כניסות / יציאות ──────────────────────────────────────────────────────────
create table if not exists maneuver_entries (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references units(id) on delete cascade,
  soldier_id uuid not null references soldiers(id) on delete cascade,
  is_entry   boolean not null,                                     -- true=כניסה, false=יציאה
  date       date not null,
  created_at timestamptz not null default now()
);
create index if not exists maneuver_entries_unit_idx on maneuver_entries(unit_id);

-- ── RLS (סקופ בצד הלקוח, כמו שאר המערכת) ──────────────────────────────────────
alter table maneuver_categories   enable row level security;
alter table maneuver_requirements enable row level security;
alter table maneuver_entries      enable row level security;

drop policy if exists maneuver_categories_all   on maneuver_categories;
drop policy if exists maneuver_requirements_all on maneuver_requirements;
drop policy if exists maneuver_entries_all       on maneuver_entries;
create policy maneuver_categories_all   on maneuver_categories   for all to authenticated using (true) with check (true);
create policy maneuver_requirements_all on maneuver_requirements for all to authenticated using (true) with check (true);
create policy maneuver_entries_all      on maneuver_entries      for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.maneuver_categories   to authenticated;
grant select, insert, update, delete on public.maneuver_requirements to authenticated;
grant select, insert, update, delete on public.maneuver_entries      to authenticated;
