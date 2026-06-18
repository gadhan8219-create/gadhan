import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { PageTitle } from '../bunker/shared';
import type { Unit } from '../../lib/database.types';
import {
  listItems, listCategories, listUnitStorages, getStorage, setStorage,
  type StorageItem, type StorageCategory, type StorageTarget,
} from '../../lib/imach';

/**
 * ניהול ימ״ח → תכולת ימ״ח/מכולה.
 * Pick a מסגרת and its ימ״ח or מכולה, optionally filter by category, fill the
 * quantities and update the storage contents.
 */
export default function ImachContentsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isRaspar = profile?.role === 'raspar';
  const raspUnitId = profile?.unit_id ?? null;

  const [units, setUnits] = useState<Unit[]>([]);
  const [items, setItems] = useState<StorageItem[]>([]);
  const [categories, setCategories] = useState<StorageCategory[]>([]);
  const [storages, setStorages] = useState<{ imach: { id: string; unit_id: string }[]; mehula: { id: string; unit_id: string }[] }>({ imach: [], mehula: [] });

  const [unitId, setUnitId] = useState('');
  const [kind, setKind] = useState<'imach' | 'mehula' | ''>('');
  const [catFilter, setCatFilter] = useState('');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const effectiveUnit = isAdmin ? unitId : (raspUnitId ?? '');

  useEffect(() => {
    Promise.all([
      supabase.from('units').select('*').order('name'),
      listItems(), listCategories(), listUnitStorages(),
    ]).then(([u, i, c, s]) => {
      if (u.data) setUnits(u.data as Unit[]);
      setItems(i); setCategories(c); setStorages(s);
    }).catch((e) => setError((e as Error).message));
  }, []);

  const imachForUnit = storages.imach.find((s) => s.unit_id === effectiveUnit) ?? null;
  const mehulaForUnit = storages.mehula.find((s) => s.unit_id === effectiveUnit) ?? null;

  const target: StorageTarget | null =
    kind === 'imach' && imachForUnit ? { kind: 'imach', id: imachForUnit.id }
    : kind === 'mehula' && mehulaForUnit ? { kind: 'mehula', id: mehulaForUnit.id }
    : null;

  // Load contents for the chosen target.
  useEffect(() => {
    if (!target) { setQty({}); return; }
    setLoading(true);
    getStorage(target)
      .then((m) => { const q: Record<string, string> = {}; for (const [k, v] of Object.entries(m)) q[k] = String(v); setQty(q); })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, effectiveUnit]);

  const shownItems = useMemo(
    () => (catFilter ? items.filter((i) => i.storage_category_id === catFilter) : items),
    [items, catFilter],
  );

  async function save() {
    if (!target) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const quantities: Record<string, number> = {};
      for (const [k, v] of Object.entries(qty)) { const n = Number(v); if (n > 0) quantities[k] = n; }
      await setStorage(target, quantities);
      setSuccess('התכולה עודכנה');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  if (!isAdmin && !isRaspar) return <Navigate to="/" replace />;
  if (isRaspar && !raspUnitId) {
    return <div className="card text-center text-slate-500">לא משוייכת לך מסגרת — פנה למנהל מערכת</div>;
  }

  const noTargets = effectiveUnit && !imachForUnit && !mehulaForUnit;

  return (
    <div className="space-y-5">
      <PageTitle title="תכולת ימ״ח / מכולה" subtitle="עדכון אחיד של תכולת מחסני החירום והמכולות" />

      <div className="rounded-lg bg-sky-50 border border-sky-200 p-3 text-sky-800 text-sm">
        תחילה יש להגדיר ימ״ח/מכולה (במסך "ניהול פריטים") על מנת להתקדם בתהליך.
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex justify-between">
          {error}<button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 ml-2">×</button>
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-emerald-800 text-sm flex justify-between">
          {success}<button onClick={() => setSuccess(null)} className="text-emerald-600 hover:text-emerald-900 ml-2">×</button>
        </div>
      )}

      <div className="card space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {isAdmin && (
            <div>
              <label className="label">מסגרת</label>
              <select className="input" value={unitId} onChange={(e) => { setUnitId(e.target.value); setKind(''); }}>
                <option value="">— בחר מסגרת —</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">ימ״ח / מכולה</label>
            <select className="input" value={kind} disabled={!effectiveUnit} onChange={(e) => setKind(e.target.value as 'imach' | 'mehula' | '')}>
              <option value="">— בחר —</option>
              {imachForUnit && <option value="imach">ימ״ח</option>}
              {mehulaForUnit && <option value="mehula">מכולה</option>}
            </select>
          </div>
          <div>
            <label className="label">סינון קטגוריה (לנוחות)</label>
            <select className="input" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="">כל הקטגוריות</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        {noTargets && <p className="text-sm text-amber-600">למסגרת זו לא הוגדרו ימ״ח/מכולה.</p>}
      </div>

      {target && (
        loading ? (
          <div className="card text-center text-slate-400 py-8 text-sm">טוען…</div>
        ) : (
          <>
            <div className="card p-0 overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>פריט</th><th>קטגוריה</th><th>יח׳</th><th className="text-center w-32">כמות</th></tr></thead>
                <tbody>
                  {shownItems.map((it) => (
                    <tr key={it.id}>
                      <td className="font-medium">{it.name}</td>
                      <td className="text-sm text-slate-600">{it.categoryName}</td>
                      <td className="text-sm text-slate-400">{it.uom ?? '—'}</td>
                      <td className="text-center">
                        <input type="number" min="0" className="input !py-1 text-center w-24 mx-auto"
                          value={qty[it.id] ?? ''} onChange={(e) => setQty((p) => ({ ...p, [it.id]: e.target.value }))} />
                      </td>
                    </tr>
                  ))}
                  {shownItems.length === 0 && <tr><td colSpan={4} className="text-center text-slate-400 py-6 text-sm">אין פריטים</td></tr>}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={save} disabled={busy} className="btn-primary w-full">
              {busy ? 'מעדכן…' : 'עדכן'}
            </button>
          </>
        )
      )}
    </div>
  );
}
