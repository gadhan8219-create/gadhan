-- 0024_bunker_shatsal.sql
-- Bunker screens 7 (שצ״ל / combat use) and 8 (סיכום / summary).
--
-- Shatsal records ammunition a unit consumed in combat. Reporting can be
-- backdated but not future-dated (enforced in the UI). Reporting decrements the
-- unit's balance (floored at 0). The summary RPC aggregates dispenses, credits
-- and shatsal across the logs to show each unit's field picture.

-- ── Shatsal log (שצ״ל) ───────────────────────────────────────────────────────
create table if not exists bunker_shatsal (
  id           uuid primary key default gen_random_uuid(),
  unit         text not null,
  reporter     text not null,
  used_on      date not null default current_date,
  items        jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  performed_by uuid references profiles(id)
);
create index if not exists bunker_shatsal_unit_idx on bunker_shatsal(unit);
create index if not exists bunker_shatsal_date_idx on bunker_shatsal(used_on desc);

-- ── Apply-shatsal RPC ────────────────────────────────────────────────────────
-- Decrements the unit balance (floored at 0) and logs the report. Over-report is
-- allowed; the unit balance never goes negative. Returns the new shatsal id.
create or replace function bunker_apply_shatsal(
  p_unit     text,
  p_reporter text,
  p_used_on  date,
  p_items    jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  it     jsonb;
  v_id   uuid;
  v_qty  numeric;
  v_item uuid;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty  := coalesce((it->>'quantity')::numeric, 0);
    v_item := (it->>'item_id')::uuid;
    if v_qty <= 0 then continue; end if;

    update bunker_unit_stock
      set quantity = greatest(0, quantity - v_qty)
      where unit = p_unit and item_id = v_item;
  end loop;

  insert into bunker_shatsal (unit, reporter, used_on, items, performed_by)
  values (p_unit, p_reporter, coalesce(p_used_on, current_date), p_items, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- ── Summary RPC ──────────────────────────────────────────────────────────────
-- Per item (optionally scoped to one unit):
--   total_ammo    = Σ dispensed − Σ credited   (ammo currently out in the field)
--   total_shatsal = Σ shatsal                  (reported combat use)
--   remaining     = total_ammo − total_shatsal (may be negative)
create or replace function bunker_summary(p_unit text default null)
returns table (
  item_id       uuid,
  item_name     text,
  total_ammo    numeric,
  total_shatsal numeric,
  remaining     numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with disp as (
    select (e->>'item_id')::uuid as item_id, sum((e->>'quantity')::numeric) as qty
    from bunker_dispenses d, jsonb_array_elements(d.items) e
    where p_unit is null or d.unit = p_unit
    group by 1
  ),
  cred as (
    select (e->>'item_id')::uuid as item_id, sum((e->>'quantity')::numeric) as qty
    from bunker_credits c, jsonb_array_elements(c.items) e
    where p_unit is null or c.unit = p_unit
    group by 1
  ),
  shat as (
    select (e->>'item_id')::uuid as item_id, sum((e->>'quantity')::numeric) as qty
    from bunker_shatsal s, jsonb_array_elements(s.items) e
    where p_unit is null or s.unit = p_unit
    group by 1
  ),
  ids as (
    select item_id from disp
    union select item_id from cred
    union select item_id from shat
  )
  select
    i.item_id,
    bi.name as item_name,
    coalesce(d.qty, 0) - coalesce(c.qty, 0)                        as total_ammo,
    coalesce(sh.qty, 0)                                            as total_shatsal,
    (coalesce(d.qty, 0) - coalesce(c.qty, 0)) - coalesce(sh.qty, 0) as remaining
  from ids i
  join bunker_items bi on bi.id = i.item_id
  left join disp d  on d.item_id  = i.item_id
  left join cred c  on c.item_id  = i.item_id
  left join shat sh on sh.item_id = i.item_id
  order by bi.name;
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table bunker_shatsal enable row level security;
drop policy if exists bunker_shatsal_all on bunker_shatsal;
create policy bunker_shatsal_all on bunker_shatsal for all to authenticated using (true) with check (true);

-- ── Grants ───────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.bunker_shatsal to authenticated;
grant execute on function bunker_apply_shatsal(text, text, date, jsonb) to authenticated;
grant execute on function bunker_summary(text) to authenticated;
