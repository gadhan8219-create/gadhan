import { supabase } from './supabase';

// ניהול ימ״ח — categories, items, ימ״ח/מכולה per unit, their contents, the
// battalion standard fighter bag, and actual soldier/generic bags.

export interface StorageCategory { id: string; name: string }

export interface StorageItem {
  id: string;
  storage_category_id: string | null;
  categoryName: string;
  name: string;
  uom: string | null;
  required: number | null;   // תקן
  in_sum: boolean;
}

export interface UnitStorage { id: string; unit_id: string }      // ימ״ח / מכולה
export interface Bag { id: string; storage_item_id: string; required: number }
export interface SoldierBag {
  id: string;
  soldier_id: string | null;
  unit_id: string;
  storage_item_id: string;
  quantity: number;
  bag_label: string | null;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));

// ── Categories ────────────────────────────────────────────────────────────────
export async function listCategories(): Promise<StorageCategory[]> {
  const { data, error } = await supabase.from('storage_category').select('id, name').order('name');
  if (error) throw error;
  return (data ?? []) as StorageCategory[];
}
export async function createCategory(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('שם קטגוריה חסר');
  const { error } = await supabase.from('storage_category').insert({ name: trimmed });
  if (error) throw (error as { code?: string }).code === '23505' ? new Error('קטגוריה כבר קיימת') : error;
}
export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('storage_category').delete().eq('id', id);
  if (error) throw error;
}

// ── Items ─────────────────────────────────────────────────────────────────────
export async function listItems(): Promise<StorageItem[]> {
  const { data, error } = await supabase
    .from('storage_items')
    .select('id, storage_category_id, name, uom, required, in_sum, storage_category(name)')
    .order('name');
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{
    id: string; storage_category_id: string | null; name: string; uom: string | null;
    required: number | null; in_sum: boolean; storage_category: { name: string } | null;
  }>).map((r) => ({
    id: r.id,
    storage_category_id: r.storage_category_id,
    categoryName: r.storage_category?.name ?? '—',
    name: r.name,
    uom: r.uom,
    required: r.required == null ? null : num(r.required),
    in_sum: r.in_sum,
  }));
}
export interface ItemInput {
  storage_category_id: string | null;
  name: string;
  uom: string | null;
  required?: number | null;
  in_sum?: boolean;
}
export async function createItem(input: ItemInput): Promise<void> {
  if (!input.name.trim()) throw new Error('שם פריט חסר');
  const { error } = await supabase.from('storage_items').insert({
    storage_category_id: input.storage_category_id,
    name: input.name.trim(),
    uom: input.uom?.trim() || null,
    required: input.required ?? null,
    in_sum: input.in_sum ?? false,
  });
  if (error) throw error;
}
export async function updateItem(id: string, patch: Partial<ItemInput>): Promise<void> {
  const { error } = await supabase.from('storage_items').update(patch).eq('id', id);
  if (error) throw error;
}
export async function deleteItem(id: string): Promise<void> {
  const { error } = await supabase.from('storage_items').delete().eq('id', id);
  if (error) throw error;
}

// ── ימ״ח / מכולה (one per unit) ────────────────────────────────────────────────
export async function listUnitStorages(): Promise<{ imach: UnitStorage[]; mehula: UnitStorage[] }> {
  const [a, b] = await Promise.all([
    supabase.from('storage_by_unit').select('id, unit_id'),
    supabase.from('substorage_by_unit').select('id, unit_id'),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
  return { imach: (a.data ?? []) as UnitStorage[], mehula: (b.data ?? []) as UnitStorage[] };
}
export async function addImach(unitId: string): Promise<void> {
  const { error } = await supabase.from('storage_by_unit').insert({ unit_id: unitId });
  if (error) throw (error as { code?: string }).code === '23505' ? new Error('כבר קיים ימ״ח למסגרת זו') : error;
}
export async function addMehula(unitId: string): Promise<void> {
  const { error } = await supabase.from('substorage_by_unit').insert({ unit_id: unitId });
  if (error) throw (error as { code?: string }).code === '23505' ? new Error('כבר קיימת מכולה למסגרת זו') : error;
}
export async function deleteImach(id: string): Promise<void> {
  const { error } = await supabase.from('storage_by_unit').delete().eq('id', id);
  if (error) throw error;
}
export async function deleteMehula(id: string): Promise<void> {
  const { error } = await supabase.from('substorage_by_unit').delete().eq('id', id);
  if (error) throw error;
}

// ── Storage contents ──────────────────────────────────────────────────────────
export type StorageTarget = { kind: 'imach' | 'mehula'; id: string };

/** item_id → quantity for the given ימ״ח/מכולה. */
export async function getStorage(target: StorageTarget): Promise<Record<string, number>> {
  const col = target.kind === 'imach' ? 'storage_by_unit_id' : 'substorage_by_unit_id';
  const { data, error } = await supabase.from('storage').select('storage_item_id, quantity').eq(col, target.id);
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ storage_item_id: string; quantity: number }>) out[r.storage_item_id] = num(r.quantity);
  return out;
}

/** Replace the contents of a ימ״ח/מכולה with the given quantities (only > 0 kept). */
export async function setStorage(target: StorageTarget, quantities: Record<string, number>): Promise<void> {
  const col = target.kind === 'imach' ? 'storage_by_unit_id' : 'substorage_by_unit_id';
  const { error: delErr } = await supabase.from('storage').delete().eq(col, target.id);
  if (delErr) throw delErr;
  const rows = Object.entries(quantities)
    .filter(([, q]) => q > 0)
    .map(([storage_item_id, quantity]) => ({ [col]: target.id, storage_item_id, quantity }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('storage').insert(rows);
  if (error) throw error;
}

/** All storage quantities for a unit (its ימ״ח + מכולה), summed per item. */
export async function getUnitStorageSums(imachId: string | null, mehulaId: string | null): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const ids: Array<['storage_by_unit_id' | 'substorage_by_unit_id', string]> = [];
  if (imachId) ids.push(['storage_by_unit_id', imachId]);
  if (mehulaId) ids.push(['substorage_by_unit_id', mehulaId]);
  for (const [col, id] of ids) {
    const { data, error } = await supabase.from('storage').select('storage_item_id, quantity').eq(col, id);
    if (error) throw error;
    for (const r of (data ?? []) as Array<{ storage_item_id: string; quantity: number }>) {
      out[r.storage_item_id] = (out[r.storage_item_id] ?? 0) + num(r.quantity);
    }
  }
  return out;
}

// ── Battalion standard bag ─────────────────────────────────────────────────────
export async function listBags(): Promise<Bag[]> {
  const { data, error } = await supabase.from('bags').select('id, storage_item_id, required');
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; storage_item_id: string; required: number }>)
    .map((r) => ({ ...r, required: num(r.required) }));
}
/** Replace the standard bag with the given per-item required quantities (> 0 kept). */
export async function setBags(quantities: Record<string, number>): Promise<void> {
  const { error: delErr } = await supabase.from('bags').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delErr) throw delErr;
  const rows = Object.entries(quantities).filter(([, q]) => q > 0).map(([storage_item_id, required]) => ({ storage_item_id, required }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('bags').insert(rows);
  if (error) throw error;
}

// ── Soldier / generic bags ──────────────────────────────────────────────────────
export async function listSoldierBags(unitId: string): Promise<SoldierBag[]> {
  const { data, error } = await supabase
    .from('soldier_bags')
    .select('id, soldier_id, unit_id, storage_item_id, quantity, bag_label')
    .eq('unit_id', unitId);
  if (error) throw error;
  return ((data ?? []) as Array<SoldierBag>).map((r) => ({ ...r, quantity: num(r.quantity) }));
}

/**
 * Replace one bag's contents. A soldier bag is keyed by (soldier_id, unit_id);
 * a generic bag by (unit_id, bag_label, soldier_id IS NULL).
 */
export async function setSoldierBag(
  args: { soldierId: string | null; unitId: string; bagLabel: string | null; quantities: Record<string, number> },
): Promise<void> {
  let del = supabase.from('soldier_bags').delete().eq('unit_id', args.unitId);
  if (args.soldierId) del = del.eq('soldier_id', args.soldierId);
  else del = del.is('soldier_id', null).eq('bag_label', args.bagLabel ?? '');
  const { error: delErr } = await del;
  if (delErr) throw delErr;

  const rows = Object.entries(args.quantities).filter(([, q]) => q > 0).map(([storage_item_id, quantity]) => ({
    soldier_id: args.soldierId,
    unit_id: args.unitId,
    storage_item_id,
    quantity,
    bag_label: args.soldierId ? null : args.bagLabel,
  }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('soldier_bags').insert(rows);
  if (error) throw error;
}

export interface SoldierBagItem { itemName: string; uom: string | null; quantity: number }

/** A single soldier's fighter-bag contents (item name + uom + quantity). */
export async function loadSoldierBagItems(soldierId: string): Promise<SoldierBagItem[]> {
  const { data, error } = await supabase
    .from('soldier_bags')
    .select('quantity, storage_items(name, uom)')
    .eq('soldier_id', soldierId);
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{ quantity: number; storage_items: { name: string; uom: string | null } | null }>)
    .map((r) => ({ itemName: r.storage_items?.name ?? '—', uom: r.storage_items?.uom ?? null, quantity: num(r.quantity) }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName, 'he'));
}

/** Delete a generic bag entirely. */
export async function deleteGenericBag(unitId: string, bagLabel: string): Promise<void> {
  const { error } = await supabase.from('soldier_bags').delete()
    .eq('unit_id', unitId).is('soldier_id', null).eq('bag_label', bagLabel);
  if (error) throw error;
}
