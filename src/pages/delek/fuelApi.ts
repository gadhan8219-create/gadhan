import { supabase } from '../../lib/supabase';

export interface GoodiTxn {
  vehicle: string;
  company: string;
  date: string;
  time: string;
  station: string;
  liters: number;
}

export interface GoodiCard {
  cardNumber: string;
  cardName: string;
  fuelType: string;
  litersUsed: number;
  litersLeft: number;
  amountUsed: number;
  lastUsage: string;
  recentUsages: GoodiTxn[];
}

/** Live lookup against the Goodi fuel-admin site via the edge function. */
export async function goodiLookup(cardNumber: string): Promise<GoodiCard | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fuel-goodi-lookup`;
  const resp = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token ?? ''}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ cardNumber: cardNumber.trim() }),
  });
  const r = await resp.json();
  if (!r.ok) throw new Error(r.error ?? 'שגיאה בשליפת נתוני כרטיס');
  return r.found ? (r.card as GoodiCard) : null;
}
