import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { PageTitle } from '../bunker/shared';
import type { Soldier, Unit } from '../../lib/database.types';
import {
  listItems, listBags, listSoldierBags, listUnitStorages, getUnitStorageSums,
  type StorageItem, type Bag, type SoldierBag,
} from '../../lib/imach';

type View = 'qty' | 'bags';

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
  const [soldiers, setSoldiers] = useState<Soldier[]>([]);
  const [storageSums, setStorageSums] = useState<Record<string, number>>({});
  const [unitId, setUnitId] = useState('');
  const [view, setView] = useState<View>('qty');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveUnit = isAdmin ? unitId : (raspUnitId ?? '');

  useEffect(() => {
    Promise.all([supabase.from('units').select('*').order('name'), listItems(), listBags()])
      .then(([u, i, b]) => { if (u.data) setUnits(u.data as Unit[]); setItems(i); setBags(b); })
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    if (!effectiveUnit) { setSoldierBags([]); setSoldiers([]); setStorageSums({}); return; }
    setLoading(true);
    (async () => {
      const [sb, su, sol] = await Promise.all([
        listSoldierBags(effectiveUnit),
        listUnitStorages(),
        supabase.from('soldiers').select('*').eq('unit_id', effectiveUnit).order('full_name'),
      ]);
      setSoldierBags(sb);
      setSoldiers((sol.data ?? []) as Soldier[]);
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

  // ── Fighter-bags matrix ──
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  // bag key → item_id → qty
  const bagGroups = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const r of soldierBags) {
      const key = r.soldier_id ?? `generic:${r.bag_label ?? ''}`;
      const cur = m.get(key) ?? {};
      cur[r.storage_item_id] = (cur[r.storage_item_id] ?? 0) + r.quantity;
      m.set(key, cur);
    }
    return m;
  }, [soldierBags]);
  // Columns = standard items, or (if no standard) every item that appears in a bag.
  const cols = useMemo(() => {
    if (bags.length > 0) {
      return bags
        .map((b) => ({ id: b.storage_item_id, name: itemById.get(b.storage_item_id)?.name ?? '—', required: b.required }))
        .filter((c) => c.name !== '—' || true);
    }
    const ids = new Set<string>();
    for (const m of bagGroups.values()) for (const k of Object.keys(m)) ids.add(k);
    return [...ids].map((id) => ({ id, name: itemById.get(id)?.name ?? '—', required: 0 }));
  }, [bags, bagGroups, itemById]);
  const soldierRows = useMemo(
    () => soldiers.map((s) => ({ name: s.full_name, pn: s.personal_number, map: bagGroups.get(s.id) ?? {} })),
    [soldiers, bagGroups],
  );
  const genericRows = useMemo(() => {
    const out: Array<{ label: string; map: Record<string, number> }> = [];
    for (const [key, map] of bagGroups) if (key.startsWith('generic:')) out.push({ label: key.slice('generic:'.length), map });
    return out.sort((a, b) => a.label.localeCompare(b.label, 'he'));
  }, [bagGroups]);

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
          {/* View toggle */}
          <div className="flex border-b border-slate-200">
            {([['qty', 'סיכום כמותי'], ['bags', 'סיכום תיקי לוחמים']] as [View, string][]).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setView(v)}
                className={`flex-1 py-2.5 text-sm font-bold transition border-b-2 ${
                  view === v ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}>{label}</button>
            ))}
          </div>

          {view === 'qty' ? (
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
          ) : (
            /* Fighter-bags matrix */
            cols.length === 0 ? (
              <div className="card text-center text-slate-400 py-8 text-sm">לא הוגדר תקן תיק לוחם</div>
            ) : (
              <div className="card p-0 overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="text-right sticky right-0 bg-slate-50">שם</th>
                      {cols.map((c) => (
                        <th key={c.id} className="text-center whitespace-nowrap">
                          {c.name}
                          {c.required > 0 && <div className="text-[10px] font-normal text-slate-400">תקן {c.required}</div>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {soldierRows.map((r, i) => (
                      <tr key={`s${i}`}>
                        <td className="font-medium whitespace-nowrap sticky right-0 bg-white">
                          {r.name}<span className="text-xs text-slate-400 mr-1">{r.pn}</span>
                        </td>
                        {cols.map((c) => {
                          const q = r.map[c.id] ?? 0;
                          const short = c.required > 0 && q < c.required;
                          return <td key={c.id} className={`text-center ${short ? 'bg-red-50 text-red-700' : ''}`}>{q || '—'}</td>;
                        })}
                      </tr>
                    ))}
                    {genericRows.length > 0 && (
                      <tr><td colSpan={cols.length + 1} className="bg-slate-100 text-xs font-semibold text-slate-500 px-2 py-1">תיקים גנריים</td></tr>
                    )}
                    {genericRows.map((r, i) => (
                      <tr key={`g${i}`}>
                        <td className="font-medium whitespace-nowrap sticky right-0 bg-white">{r.label}</td>
                        {cols.map((c) => {
                          const q = r.map[c.id] ?? 0;
                          const short = c.required > 0 && q < c.required;
                          return <td key={c.id} className={`text-center ${short ? 'bg-red-50 text-red-700' : ''}`}>{q || '—'}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
