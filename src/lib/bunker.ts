import { supabase } from './supabase';

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
