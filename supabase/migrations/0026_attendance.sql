-- 0026_attendance.sql
-- שלישות — דיווח נוכחות (דוח 1).
-- Daily presence reporting for soldiers during their reserve duty.
--   attendance_statuses : free-text presence statuses (≤20 chars), managed by admin.
--   attendance          : one row per soldier per date → status.

-- ── Presence statuses (סטטוסים לנוכחות) ──────────────────────────────────────
create table if not exists attendance_statuses (
  id         uuid primary key default gen_random_uuid(),
  status     text not null check (char_length(status) > 0 and char_length(status) <= 20),
  created_at timestamptz not null default now()
);

-- ── Attendance log (נוכחות) ──────────────────────────────────────────────────
create table if not exists attendance (
  id          uuid primary key default gen_random_uuid(),
  soldier_id  uuid not null references soldiers(id) on delete cascade,
  status_id   uuid not null references attendance_statuses(id),
  date        date not null,
  recorded_by uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (soldier_id, date)
);
create index if not exists attendance_date_idx    on attendance(date);
create index if not exists attendance_soldier_idx on attendance(soldier_id);

-- ── Confirm-report RPC ───────────────────────────────────────────────────────
-- Upserts one attendance row per soldier for the given date. p_records is a
-- jsonb array of { soldier_id, status_id }. Re-confirming a date overwrites the
-- previous status for each soldier (supports retroactive edits).
create or replace function attendance_confirm_report(
  p_date    date,
  p_records jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec     jsonb;
  v_count integer := 0;
begin
  if p_date > current_date then
    raise exception 'cannot report attendance for a future date';
  end if;

  for rec in select * from jsonb_array_elements(p_records) loop
    insert into attendance (soldier_id, status_id, date, recorded_by, updated_at)
    values (
      (rec->>'soldier_id')::uuid,
      (rec->>'status_id')::uuid,
      p_date,
      auth.uid(),
      now()
    )
    on conflict (soldier_id, date)
    do update set status_id   = excluded.status_id,
                  recorded_by = excluded.recorded_by,
                  updated_at  = now();
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table attendance_statuses enable row level security;
alter table attendance          enable row level security;
drop policy if exists attendance_statuses_all on attendance_statuses;
drop policy if exists attendance_all          on attendance;
create policy attendance_statuses_all on attendance_statuses for all to authenticated using (true) with check (true);
create policy attendance_all          on attendance          for all to authenticated using (true) with check (true);

-- ── Grants ───────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.attendance_statuses to authenticated;
grant select, insert, update, delete on public.attendance          to authenticated;
grant execute on function attendance_confirm_report(date, jsonb) to authenticated;
