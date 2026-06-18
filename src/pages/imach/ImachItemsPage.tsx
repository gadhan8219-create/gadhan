import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { PageTitle } from '../bunker/shared';
import type { Unit } from '../../lib/database.types';
import {
  listCategories, createCategory, deleteCategory,
  listItems, createItem, updateItem, deleteItem,
  listUnitStorages, addImach, addMehula, deleteImach, deleteMehula,
  type StorageCategory, type StorageItem, type UnitStorage,
} from '../../lib/imach';

/**
 * ניהול ימ״ח → ניהול פריטים.
 * Everyone can add/view categories, items, ימ״ח and מכולות. Admins additionally
 * set a פריט's תקן (required) and whether it appears in the summary (in_sum).
 */
export default function ImachItemsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isRaspar = profile?.role === 'raspar';

  const [units, setUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<StorageCategory[]>([]);
  const [items, setItems] = useState<StorageItem[]>([]);
  const [storages, setStorages] = useState<{ imach: UnitStorage[]; mehula: UnitStorage[] }>({ imach: [], mehula: [] });
  const [error, setError] = useState<string | null>(null);

  // forms
  const [newCat, setNewCat] = useState('');
  const [suUnit, setSuUnit] = useState('');
  const [form, setForm] = useState({ catId: '', name: '', uom: '', required: '', inSum: false });
  const [editing, setEditing] = useState<StorageItem | null>(null);

  const unitName = useMemo(() => {
    const m = new Map(units.map((u) => [u.id, u.name]));
    return (id: string) => m.get(id) ?? '—';
  }, [units]);

  async function reload() {
    try {
      const [c, i, s] = await Promise.all([listCategories(), listItems(), listUnitStorages()]);
      setCategories(c); setItems(i); setStorages(s);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => {
    supabase.from('units').select('*').order('name').then(({ data }) => { if (data) setUnits(data as Unit[]); });
    reload();
  }, []);

  async function run(fn: () => Promise<void>) {
    setError(null);
    try { await fn(); await reload(); } catch (e) { setError((e as Error).message); }
  }

  async function addItem() {
    if (!form.name.trim()) { setError('נא להזין שם פריט'); return; }
    await run(async () => {
      await createItem({
        storage_category_id: form.catId || null,
        name: form.name, uom: form.uom || null,
        required: isAdmin && form.required ? Number(form.required) : null,
        in_sum: isAdmin ? form.inSum : false,
      });
      setForm({ catId: '', name: '', uom: '', required: '', inSum: false });
    });
  }

  if (!isAdmin && !isRaspar) return <Navigate to="/" replace />;

  const imachUnits = new Set(storages.imach.map((s) => s.unit_id));
  const mehulaUnits = new Set(storages.mehula.map((s) => s.unit_id));

  return (
    <div className="space-y-5">
      <PageTitle title="ניהול פריטים" subtitle="פריטים, קטגוריות, ימ״ח ומכולות" />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex justify-between">
          {error}<button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 ml-2">×</button>
        </div>
      )}

      {/* Categories */}
      <div className="card">
        <label className="label">קטגוריות</label>
        <div className="flex gap-2">
          <input className="input" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="שם קטגוריה…" />
          <button type="button" onClick={() => run(async () => { await createCategory(newCat); setNewCat(''); })}
            className="btn-secondary whitespace-nowrap">+ הוסף</button>
        </div>
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {categories.map((c) => (
              <span key={c.id} className="badge bg-slate-100 text-slate-700 flex items-center gap-1">
                {c.name}
                <button onClick={() => run(() => deleteCategory(c.id))} className="text-red-400 hover:text-red-600 mr-1">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ימ״ח / מכולה */}
      <div className="card space-y-3">
        <label className="label">ימ״ח / מכולה למסגרת</label>
        <div className="flex gap-2 flex-wrap items-end">
          <select className="input flex-1 min-w-[160px]" value={suUnit} onChange={(e) => setSuUnit(e.target.value)}>
            <option value="">— בחר מסגרת —</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <button type="button" disabled={!suUnit || imachUnits.has(suUnit)}
            onClick={() => run(() => addImach(suUnit))} className="btn-secondary disabled:opacity-40">+ ימ״ח</button>
          <button type="button" disabled={!suUnit || mehulaUnits.has(suUnit)}
            onClick={() => run(() => addMehula(suUnit))} className="btn-secondary disabled:opacity-40">+ מכולה</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">ימ״חים</div>
            {storages.imach.length === 0 ? <p className="text-xs text-slate-400">אין</p> : storages.imach.map((s) => (
              <div key={s.id} className="flex justify-between text-sm border-b border-slate-100 py-1">
                {unitName(s.unit_id)}
                <button onClick={() => run(() => deleteImach(s.id))} className="text-red-400 hover:text-red-600">×</button>
              </div>
            ))}
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">מכולות</div>
            {storages.mehula.length === 0 ? <p className="text-xs text-slate-400">אין</p> : storages.mehula.map((s) => (
              <div key={s.id} className="flex justify-between text-sm border-b border-slate-100 py-1">
                {unitName(s.unit_id)}
                <button onClick={() => run(() => deleteMehula(s.id))} className="text-red-400 hover:text-red-600">×</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add item */}
      <div className="card space-y-3">
        <h3 className="font-semibold">הוספת פריט</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">קטגוריה</label>
            <select className="input" value={form.catId} onChange={(e) => setForm({ ...form, catId: e.target.value })}>
              <option value="">— ללא —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">שם פריט</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">יחידת מידה</label>
            <input className="input" value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} placeholder='יח׳ / ק"ג / ליטר…' />
          </div>
          {isAdmin && (
            <>
              <div>
                <label className="label">תקן</label>
                <input type="number" className="input" value={form.required} onChange={(e) => setForm({ ...form, required: e.target.value })} />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer mb-2.5">
                  <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={form.inSum} onChange={(e) => setForm({ ...form, inSum: e.target.checked })} />
                  <span className="text-sm text-slate-600">כלול בסיכום</span>
                </label>
              </div>
            </>
          )}
        </div>
        <button type="button" onClick={addItem} className="btn-primary">הוסף פריט</button>
      </div>

      {/* Items list */}
      <div className="card p-0 overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>פריט</th><th>קטגוריה</th><th>יח׳ מידה</th>
              {isAdmin && <><th className="text-center">תקן</th><th className="text-center">בסיכום</th></>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className={isAdmin ? 'cursor-pointer hover:bg-slate-50' : ''} onClick={() => isAdmin && setEditing(it)}>
                <td className="font-medium">{it.name}</td>
                <td className="text-sm text-slate-600">{it.categoryName}</td>
                <td className="text-sm text-slate-600">{it.uom ?? '—'}</td>
                {isAdmin && <>
                  <td className="text-center">{it.required ?? '—'}</td>
                  <td className="text-center">{it.in_sum ? 'כן' : '—'}</td>
                </>}
                <td><button onClick={(e) => { e.stopPropagation(); run(() => deleteItem(it.id)); }} className="text-red-400 hover:text-red-600">מחק</button></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={isAdmin ? 6 : 4} className="text-center text-slate-400 py-6 text-sm">אין פריטים</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Edit modal (admin) */}
      {editing && isAdmin && (
        <EditItemModal item={editing} categories={categories}
          onClose={() => setEditing(null)}
          onSave={(patch) => run(async () => { await updateItem(editing.id, patch); setEditing(null); })} />
      )}
    </div>
  );
}

function EditItemModal({
  item, categories, onClose, onSave,
}: {
  item: StorageItem;
  categories: StorageCategory[];
  onClose: () => void;
  onSave: (patch: { storage_category_id: string | null; name: string; uom: string | null; required: number | null; in_sum: boolean }) => void;
}) {
  const [catId, setCatId] = useState(item.storage_category_id ?? '');
  const [name, setName] = useState(item.name);
  const [uom, setUom] = useState(item.uom ?? '');
  const [required, setRequired] = useState(item.required != null ? String(item.required) : '');
  const [inSum, setInSum] = useState(item.in_sum);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-bold">עריכת פריט</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>
        <div><label className="label">שם</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label">קטגוריה</label>
          <select className="input" value={catId} onChange={(e) => setCatId(e.target.value)}>
            <option value="">— ללא —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><label className="label">יחידת מידה</label><input className="input" value={uom} onChange={(e) => setUom(e.target.value)} /></div>
        <div><label className="label">תקן</label><input type="number" className="input" value={required} onChange={(e) => setRequired(e.target.value)} /></div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={inSum} onChange={(e) => setInSum(e.target.checked)} />
          <span className="text-sm text-slate-600">כלול בסיכום</span>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary">ביטול</button>
          <button onClick={() => onSave({ storage_category_id: catId || null, name: name.trim(), uom: uom.trim() || null, required: required ? Number(required) : null, in_sum: inSum })} className="btn-primary">שמור</button>
        </div>
      </div>
    </div>
  );
}
