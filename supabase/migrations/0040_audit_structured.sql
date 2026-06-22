-- 0040_audit_structured.sql — structured audit fields on audit_logs for the
-- unified יומן ביקורת. Old free-form rows (category NULL) stay; the new screen
-- reads only structured rows (category NOT NULL).

alter table audit_logs add column if not exists category    text;  -- נשקייה / קשר / רכב / בונקר
alter table audit_logs add column if not exists action_type text;  -- החתמה / זיכוי / ...
alter table audit_logs add column if not exists soldier_name text; -- שם החייל (אם קיים)
alter table audit_logs add column if not exists items        jsonb; -- ["פריט x2", ...]

create index if not exists audit_logs_category_idx on audit_logs(category);
