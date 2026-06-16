-- 0035_weapons_returns_raspar.sql
-- Same silent-failure class as the raspar signing bug (0033): a raspar performing
-- זיכוי (return) tried to INSERT into weapons_returns, but the only write policy
-- (0018) was admin-only — so the insert was rejected and the error was swallowed,
-- breaking the cumulative זיכויים PDF history. Allow a raspar to record returns
-- for soldiers in their own framework.

drop policy if exists weapons_returns_raspar_insert on weapons_returns;
create policy weapons_returns_raspar_insert on weapons_returns for insert
  with check (
    is_admin()
    or (
      current_role_t() = 'raspar'
      and exists (
        select 1 from soldiers s
        where s.personal_number = weapons_returns.soldier_pn
          and s.unit_id = current_unit_id()
      )
    )
  );
