import { supabase } from './supabase';
import { logAction } from './audit';

const fmtItems = (items: ReceiptItem[]) => items.map((i) => `${i.name} x${i.quantity}`);

export interface BunkerWarehouse { id: string; name: string; created_at: string }
export interface BunkerItem { id: string; name: string; created_at: string }
export interface BunkerStockRow { warehouse_id: string; item_id: string; quantity: number }
export interface ReceiptItem { item_id: string; name: string; quantity: number }
export interface BunkerReceipt {
  id: string;
  warehouse_id: string;
  receiver: string;
  source: string | null;
  items: ReceiptItem[];
  received_at: string;
}
export interface BunkerUnitStockRow { unit: string; item_id: string; quantity: number }
export interface BunkerDispense {
  id: string;
  warehouse_id: string;
  unit: string;
  person: string;
  items: ReceiptItem[];
  dispensed_at: string;
}
export interface BunkerCredit {
  id: string;
  unit: string;
  warehouse_id: string;
  receiver: string;
  items: ReceiptItem[];
  credited_at: string;
}

export interface BunkerTransfer {
  id: string;
  origin_warehouse_id: string;
  destination_warehouse_id: string;
  in_charge: string;
  items: ReceiptItem[];
  transferred_at: string;
}

export interface BunkerShatsal {
  id: string;
  unit: string;
  reporter: string;
  used_on: string;
  items: ReceiptItem[];
  created_at: string;
}
export interface BunkerSummaryRow {
  item_id: string;
  item_name: string;
  total_ammo: number;
  total_shatsal: number;
  remaining: number;
}

export interface BunkerRegulation {
  id: string;
  warehouse_id: string;
  target: string;
  performer: string;
  items: ReceiptItem[];
  regulated_at: string;
}

// Fixed bunker unit roster (kept separate from the org-wide `units` table).
export const BUNKER_UNITS = [
  'פלוגה א׳', 'פלוגה ב׳', 'פלוגה ג׳', 'מחסר', 'צמה', 'מפג״ד', 'ניוד', 'תאגד',
] as const;

// ── Warehouses ──────────────────────────────────────────────────────────────
export async function listWarehouses(): Promise<BunkerWarehouse[]> {
  const { data, error } = await supabase.from('bunker_warehouses').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as BunkerWarehouse[];
}

export async function createWarehouse(name: string): Promise<void> {
  const { error } = await supabase.from('bunker_warehouses').insert({ name });
  if (error) throw error;
}

export async function deleteWarehouse(id: string): Promise<void> {
  const { error } = await supabase.from('bunker_warehouses').delete().eq('id', id);
  if (error) throw error;
}

// True if the warehouse holds any item with quantity > 0 (blocks deletion).
export async function warehouseHasStock(id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('bunker_stock')
    .select('warehouse_id')
    .eq('warehouse_id', id)
    .gt('quantity', 0)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

// ── Items ───────────────────────────────────────────────────────────────────
export async function listItems(): Promise<BunkerItem[]> {
  const { data, error } = await supabase.from('bunker_items').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as BunkerItem[];
}

export async function createItem(name: string): Promise<BunkerItem> {
  const { data, error } = await supabase.from('bunker_items').insert({ name }).select().single();
  if (error) throw error;
  return data as BunkerItem;
}

// ── Stock ───────────────────────────────────────────────────────────────────
export async function listStock(warehouseId?: string): Promise<BunkerStockRow[]> {
  let q = supabase.from('bunker_stock').select('*');
  if (warehouseId) q = q.eq('warehouse_id', warehouseId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as BunkerStockRow[];
}

// ── Receipts ────────────────────────────────────────────────────────────────
export async function applyReceipt(
  warehouseId: string,
  receiver: string,
  source: string,
  items: ReceiptItem[],
): Promise<void> {
  const { error } = await supabase.rpc('bunker_apply_receipt', {
    p_warehouse: warehouseId,
    p_receiver: receiver,
    p_source: source || null,
    p_items: items,
  });
  if (error) throw error;
  await logAction({ category: 'בונקר', actionType: 'קבלות', soldierName: receiver, items: fmtItems(items) });
}

export async function recentReceipts(warehouseId: string, limit = 5): Promise<BunkerReceipt[]> {
  const { data, error } = await supabase
    .from('bunker_receipts')
    .select('*')
    .eq('warehouse_id', warehouseId)
    .order('received_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as BunkerReceipt[];
}

// ── Unit stock ──────────────────────────────────────────────────────────────
export async function listUnitStock(unit: string): Promise<BunkerUnitStockRow[]> {
  const { data, error } = await supabase.from('bunker_unit_stock').select('*').eq('unit', unit);
  if (error) throw error;
  return (data ?? []) as BunkerUnitStockRow[];
}

// ── Dispense ────────────────────────────────────────────────────────────────
export async function applyDispense(
  warehouseId: string,
  unit: string,
  person: string,
  items: ReceiptItem[],
): Promise<void> {
  const { error } = await supabase.rpc('bunker_apply_dispense', {
    p_warehouse: warehouseId,
    p_unit: unit,
    p_person: person,
    p_items: items,
  });
  if (error) throw error;
  await logAction({ category: 'בונקר', actionType: 'ניפוק', soldierName: person, items: fmtItems(items) });
}

export async function recentDispenses(unit: string, limit = 5): Promise<BunkerDispense[]> {
  const { data, error } = await supabase
    .from('bunker_dispenses')
    .select('*')
    .eq('unit', unit)
    .order('dispensed_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as BunkerDispense[];
}

// ── Credit ──────────────────────────────────────────────────────────────────
export async function applyCredit(
  unit: string,
  warehouseId: string,
  receiver: string,
  items: ReceiptItem[],
): Promise<void> {
  const { error } = await supabase.rpc('bunker_apply_credit', {
    p_unit: unit,
    p_warehouse: warehouseId,
    p_receiver: receiver,
    p_items: items,
  });
  if (error) throw error;
  await logAction({ category: 'בונקר', actionType: 'זיכוי', soldierName: receiver, items: fmtItems(items) });
}

export async function recentCredits(unit: string, limit = 5): Promise<BunkerCredit[]> {
  const { data, error } = await supabase
    .from('bunker_credits')
    .select('*')
    .eq('unit', unit)
    .order('credited_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as BunkerCredit[];
}

// ── Transfer ────────────────────────────────────────────────────────────────
export async function applyTransfer(
  originId: string,
  destinationId: string,
  inCharge: string,
  items: ReceiptItem[],
): Promise<void> {
  const { error } = await supabase.rpc('bunker_apply_transfer', {
    p_origin: originId,
    p_destination: destinationId,
    p_in_charge: inCharge,
    p_items: items,
  });
  if (error) throw error;
  await logAction({ category: 'בונקר', actionType: 'העברה', soldierName: inCharge, items: fmtItems(items) });
}

export async function recentTransfers(originId: string, limit = 5): Promise<BunkerTransfer[]> {
  const { data, error } = await supabase
    .from('bunker_transfers')
    .select('*')
    .eq('origin_warehouse_id', originId)
    .order('transferred_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as BunkerTransfer[];
}

// ── Shatsal (combat use) ────────────────────────────────────────────────────
export async function applyShatsal(
  unit: string,
  reporter: string,
  usedOn: string,
  items: ReceiptItem[],
): Promise<void> {
  const { error } = await supabase.rpc('bunker_apply_shatsal', {
    p_unit: unit,
    p_reporter: reporter,
    p_used_on: usedOn,
    p_items: items,
  });
  if (error) throw error;
  await logAction({ category: 'בונקר', actionType: 'שצ״ל', soldierName: reporter, items: fmtItems(items) });
}

export async function recentShatsal(unit: string, limit = 5): Promise<BunkerShatsal[]> {
  const { data, error } = await supabase
    .from('bunker_shatsal')
    .select('*')
    .eq('unit', unit)
    .order('used_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as BunkerShatsal[];
}

// ── Summary ─────────────────────────────────────────────────────────────────
export async function getSummary(unit?: string): Promise<BunkerSummaryRow[]> {
  const { data, error } = await supabase.rpc('bunker_summary', { p_unit: unit ?? null });
  if (error) throw error;
  return (data ?? []) as BunkerSummaryRow[];
}

// ── Regulations (ammo leaving the unit to external parties) ───────────────────
export async function applyRegulation(
  warehouseId: string,
  target: string,
  performer: string,
  items: ReceiptItem[],
): Promise<void> {
  const { error } = await supabase.rpc('bunker_apply_regulation', {
    p_warehouse: warehouseId,
    p_target: target,
    p_performer: performer,
    p_items: items,
  });
  if (error) throw error;
  await logAction({ category: 'בונקר', actionType: 'וויסותים', soldierName: performer, items: fmtItems(items) });
}

export async function recentRegulations(warehouseId: string, limit = 5): Promise<BunkerRegulation[]> {
  const { data, error } = await supabase
    .from('bunker_regulations')
    .select('*')
    .eq('warehouse_id', warehouseId)
    .order('regulated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as BunkerRegulation[];
}
