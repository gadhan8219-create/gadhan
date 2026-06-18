import { supabase } from './supabase';

export interface HeldItem {
  itemId: string;
  itemName: string;
  serialNumber: string | null;
  quantity: number;
  source: 'radio' | 'weapons';
  zeroed?: boolean; // weapons only — item is marked מאופסן (still signed)
}

/** Synthetic serial used for non-serial (quantity-tracked) weapons items. */
const isQtySerial = (s: string) => s.startsWith('__qty__');

/**
 * Compute every item a soldier is currently signed for, across both modules:
 *   - קשר (radio): issued minus returned from signings/signing_items, by soldier id.
 *   - נשק (weapons): rows in weapons_item_serials assigned to the soldier's
 *     personal number (synthetic qty rows collapsed into a count).
 * Inspections do not affect the balance.
 */
export async function loadSoldierHeldItems(soldierId: string, personalNumber?: string): Promise<HeldItem[]> {
  const result: HeldItem[] = [];

  // ── קשר (radio) ──
  const { data, error } = await supabase
    .from('signings')
    .select(`
      id,
      type,
      signing_items(item_id, quantity, action, serial_number, item:items(name))
    `)
    .eq('soldier_id', soldierId);
  if (error) throw error;

  const radioMap = new Map<string, HeldItem>();
  const rows = (data ?? []) as unknown as Array<{
    signing_items: Array<{
      item_id: string;
      quantity: number;
      action: string;
      serial_number: string | null;
      item: { name: string } | null;
    }>;
  }>;
  for (const s of rows) {
    for (const li of s.signing_items ?? []) {
      const key = `${li.item_id}::${li.serial_number ?? ''}`;
      const existing = radioMap.get(key) ?? {
        itemId: li.item_id,
        itemName: li.item?.name ?? '?',
        serialNumber: li.serial_number,
        quantity: 0,
        source: 'radio' as const,
      };
      if (li.action === 'issued') existing.quantity += li.quantity;
      else if (li.action === 'returned') existing.quantity -= li.quantity;
      radioMap.set(key, existing);
    }
  }
  result.push(...Array.from(radioMap.values()).filter((i) => i.quantity > 0));

  // ── נשק (weapons) ──
  if (personalNumber) {
    const { data: wdata, error: werr } = await supabase
      .from('weapons_item_serials')
      .select('serial_number, is_zeroed, weapons_items(name)')
      .eq('assigned_to_pn', personalNumber);
    if (werr) throw werr;

    const qtyMap = new Map<string, HeldItem>();
    const wrows = (wdata ?? []) as unknown as Array<{ serial_number: string; is_zeroed: boolean | null; weapons_items: { name: string } | null }>;
    for (const r of wrows) {
      const name = r.weapons_items?.name ?? '?';
      if (isQtySerial(r.serial_number)) {
        const key = `w::${name}`;
        const ex = qtyMap.get(key) ?? { itemId: key, itemName: name, serialNumber: null, quantity: 0, source: 'weapons' as const };
        ex.quantity += 1;
        qtyMap.set(key, ex);
      } else {
        result.push({
          itemId: `w::${r.serial_number}`,
          itemName: name,
          serialNumber: r.serial_number,
          quantity: 1,
          source: 'weapons',
          zeroed: r.is_zeroed ?? false,
        });
      }
    }
    result.push(...qtyMap.values());
  }

  return result;
}
