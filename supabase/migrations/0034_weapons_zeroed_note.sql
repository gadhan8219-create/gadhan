-- 0034_weapons_zeroed_note.sql
-- Optional free-text note captured when a weapon is zeroed (איפסון).
-- Used to record e.g. the team security officer ("בטחונית צוות"). Stored per
-- serial row; cleared when the item is returned to the battalion (see doZikhui).
alter table weapons_item_serials
  add column if not exists zeroed_note text;
