-- 0014_weapons_items.sql
-- Add module + has_serials + quantity to items table
-- module: 'radio' | 'weapons' — separates item pools per module
-- has_serials: true = tracked via item_serials, false = tracked by quantity
-- quantity: used when has_serials = false

alter table items
  add column if not exists module text not null default 'radio',
  add column if not exists has_serials boolean not null default true,
  add column if not exists quantity integer;

-- all existing items belong to radio module
update items set module = 'radio' where module = 'radio';

-- index for module filter
create index if not exists items_module_idx on items(module);
