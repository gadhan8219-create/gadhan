import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { PageTitle } from '../bunker/shared';
import type { Unit } from '../../lib/database.types';
import {
  listItems, listBags, listSoldierBags, listUnitStorages, getUnitStorageSums,
  type StorageItem, type Bag, type SoldierBag,
} from '../../lib/imach';

/**
 * ניהול ימ״ח → סיכום.
 * Full equipment picture per מסגרת: fighter-bag count (and how many meet the
 * standard), and per-item תקן vs the actual total (soldier bags + ימ״ח/מכולה).
 * Shows bags (including generic) and items with in_sum = true only.
 */
export default function ImachSummaryPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isRaspar = profile?.role === 'raspar';
  const raspUnitId = profile?.unit_id ?? null;

  const [units, setUnits] = useState<Unit[]>([]);
  const [items, setItems] = useState<StorageItem[]>([]);
  const [bags, setBags] = useState<Bag[]>([]);
  const [soldierBags, setSoldierBags] = useState<SoldierBag[]>([]);
  const [storageSums, setStorageSums] = useState<Record<string, number>>({});
  const [unitId, setUnitId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveUnit = isAdmin ? unitId : (raspUnitId ?? '');

  useEffect(() => {
    Promise.all([supabase.from('units').select('*').order('name'), listItems(), listBags()])
      .then(([u, i, b]) => { if (u.data) setUnits(u.data as Unit[]); setItems(i); setBags(b); })
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    if (!effectiveUnit) { setSoldierBags([]); setStorageSums({}); return; }
    setLoading(true);
    (async () => {
      const [sb, su] = await Promise.all([listSoldierBags(effectiveUnit), listUnitStorages()]);
      setSoldierBags(sb);
      const imachId = su.imach.find((s) => s.unit_id === effectiveUnit)?.id ?? null;
      const mehulaId = su.mehula.find((s) => s.unit_id === effectiveUnit)?.id ?? null;
      setStorageSums(await getUnitStorageSums(imachId, mehulaId));
    })().catch((e) => setError((e as Error).message)).finally(() => setLoading(false));
  }, [effectiveUnit]);

  // Group soldier_bags into bags (per soldier, or per generic label).
  const bagsView = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const r of soldierBags) {
      const key = r.soldier_id ?? `generic:${r.bag_label ?? ''}`;
      const m = map.get(key) ?? {};
      m[r.storage_item_id] = (m[r.storage_item_id] ?? 0) + r.quantity;
      map.set(key, m);
    }
    return [...map.values()];
  }, [soldierBags]);

  const standard = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of bags) m[b.storage_item_id] = b.required;
    return m;
  }, [bags]);

  const bagCount = bagsView.length;
  const fullBags = useMemo(() => {
    const stdEntries = Object.entries(standard);
    if (stdEntries.length === 0) return 0; // no standard defined → none counted as "full"
    return bagsView.filter((bag) => stdEntries.every(([itemId, req]) => (bag[itemId] ?? 0) >= req)).length;
  }, [bagsView, standard]);

  // Per in_sum item: תקן vs (soldier bags total + storage total).
  const summaryRows = useMemo(() => {
    const sbTotals: Record<string, number> = {};
    for (const r of soldierBags) sbTotals[r.storage_item_id] = (sbTotals[r.storage_item_id] ?? 0) + r.quantity;
    return items.filter((i) => i.in_sum).map((it) => {
      const actual = (sbTotals[it.id] ?? 0) + (storageSums[it.id] ?? 0);
      return { item: it, required: it.required ?? 0, actual };
    });
  }, [items, soldierBags, storageSums]);

  if (!isAdmin && !isRaspar) return <Navigate to="/" replace />;
  if (isRaspar && !raspUnitId) {
    return <div className="card text-center text-slate-500">לא משוייכת לך מסגרת — פנה למנהל מערכת</div>;
  }

  return (
    <div className="space-y-5">
      <PageTitle title="סיכום" subtitle="תמונת ציוד הלוחמים לפי מסגרת" />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex justify-between">
          {error}<button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 ml-2">×</button>
        </div>
      )}

      {isAdmin && (
        <div className="card">
          <label className="label">מסגרת</label>
          <select className="input" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">— בחר מסגרת —</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      )}

      {!effectiveUnit ? (
        <div className="card text-center text-slate-400 py-8 text-sm">יש לבחור מסגרת</div>
      ) : loading ? (
        <div className="card text-center text-slate-400 py-8 text-sm">טוען…</div>
      ) : (
        <>
          {/* Fighter bags */}
          <div className="card">
            <div className="text-sm text-slate-500 mb-1">תיקי לוחם</div>
            <div className="text-2xl font-bold text-slate-800">
              {bagCount} <span className="text-slate-400 text-base font-normal">תיקים</span>
              <span className="mx-2 text-slate-300">·</span>
              <span className="text-emerald-700">{fullBags}</span> <span className="text-slate-400 text-base font-normal">מלאים לפי התקן</span>
            </div>
          </div>

          {/* Items (in_sum) */}
          <div className="card p-0 overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>פריט</th><th className="text-center">תקן</th><th className="text-center">סה״כ (תיקים + מחסן)</th><th className="text-center">סטטוס</th></tr></thead>
              <tbody>
                {summaryRows.map(({ item, required, actual }) => {
                  const short = required > 0 && actual < required;
                  return (
                    <tr key={item.id}>
                      <td className="font-medium">{item.name}<span className="text-xs text-slate-400 mr-1">{item.uom ?? ''}</span></td>
                      <td className="text-center">{required || '—'}</td>
                      <td className={`text-center font-semibold ${short ? 'text-red-600' : 'text-emerald-700'}`}>{actual}</td>
                      <td className="text-center">
                        {required === 0 ? <span className="text-slate-300">—</span>
                          : short ? <span className="badge bg-red-50 text-red-700">חסר {required - actual}</span>
                          : <span className="badge bg-emerald-50 text-emerald-700">תקין</span>}
                      </td>
                    </tr>
                  );
                })}
                {summaryRows.length === 0 && <tr><td colSpan={4} className="text-center text-slate-400 py-6 text-sm">אין פריטים המוגדרים לסיכום</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
