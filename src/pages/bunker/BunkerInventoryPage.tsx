import { useEffect, useMemo, useState } from 'react';
import { PageTitle } from './shared';
import {
  listWarehouses, listItems, listStock,
  createWarehouse, deleteWarehouse, warehouseHasStock,
  type BunkerWarehouse, type BunkerItem, type BunkerStockRow,
} from '../../lib/bunker';

// Per-warehouse column accent colours (cycled).
const COL_ACCENTS = [
  'text-emerald-700 bg-emerald-50/40',
  'text-sky-700 bg-sky-50/40',
  'text-violet-700 bg-violet-50/40',
  'text-rose-700 bg-rose-50/40',
  'text-teal-700 bg-teal-50/40',
];

export default function BunkerInventoryPage() {
  const [warehouses, setWarehouses] = useState<BunkerWarehouse[]>([]);
  const [items, setItems] = useState<BunkerItem[]>([]);
  const [stock, setStock] = useState<BunkerStockRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState<'create' | 'delete'>('create');
  const [newName, setNewName] = useState('');
  const [delId, setDelId] = useState('');
  const [search, setSearch] = useState('');

  async function reload() {
    try {
      const [w, i, s] = await Promise.all([listWarehouses(), listItems(), listStock()]);
      setWarehouses(w); setItems(i); setStock(s);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => { reload(); }, []);

  const itemName = useMemo(() => {
    const m = new Map(items.map((i) => [i.id, i.name]));
    return (id: string) => m.get(id) ?? '—';
  }, [items]);

  // Pivot: item → { warehouseId → quantity }.
  const rows = useMemo(() => {
    const byItem = new Map<string, Map<string, number>>();
    for (const s of stock) {
      if (!byItem.has(s.item_id)) byItem.set(s.item_id, new Map());
      byItem.get(s.item_id)!.set(s.warehouse_id, s.quantity);
    }
    return Array.from(byItem.entries())
      .map(([itemId, perWh]) => {
        const total = Array.from(perWh.values()).reduce((a, b) => a + b, 0);
        return { itemId, name: itemName(itemId), perWh, total };
      })
      .filter((r) => r.total > 0)
      .filter((r) => !search || r.name.includes(search))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [stock, itemName, search]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = newName.trim();
    if (!name) return;
    if (warehouses.some((w) => w.name === name)) { setError(`מחסן "${name}" כבר קיים`); return; }
    setBusy(true);
    try {
      await createWarehouse(name);
      setNewName('');
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setError(null);
    if (!delId) return;
    const wh = warehouses.find((w) => w.id === delId);
    setBusy(true);
    try {
      if (await warehouseHasStock(delId)) {
        setError(`לא ניתן למחוק את "${wh?.name}" — משויכת אליו תחמושת`);
        return;
      }
      if (!confirm(`למחוק את מחסן "${wh?.name}"?`)) return;
      await deleteWarehouse(delId);
      setDelId('');
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageTitle icon="📦" title="מלאי בונקר" subtitle="מלאי תחמושת זמין בכל המחסנים" />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 ml-2">×</button>
        </div>
      )}

      {/* Warehouse management */}
      <div className="card space-y-4">
        <h2 className="font-bold text-slate-800">🏚️ ניהול מחסנים</h2>
        <div className="flex border-b border-slate-200">
          {(['create', 'delete'] as const).map((t) => (
            <button key={t} type="button" onClick={() => { setTab(t); setError(null); }}
              className={`flex-1 py-2.5 text-sm font-bold transition border-b-2 ${
                tab === t ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}>
              {t === 'create' ? '➕ יצירת מחסן' : '🗑️ מחיקת מחסן'}
            </button>
          ))}
        </div>

        {tab === 'create' ? (
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="label">שם המחסן</label>
              <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="שם המחסן..." />
            </div>
            <button type="submit" disabled={busy} className="btn-primary">➕ הקם מחסן</button>
          </form>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="label">בחר מחסן למחיקה</label>
              <select className="input" value={delId} onChange={(e) => setDelId(e.target.value)}>
                <option value="">— בחר מחסן —</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <button type="button" disabled={busy || !delId} onClick={handleDelete}
              className="btn-primary !bg-red-600 hover:!bg-red-700 disabled:opacity-40">🗑️ מחק מחסן</button>
          </div>
        )}
        <p className="text-xs text-slate-400">לא ניתן למחוק מחסן שמשויכת אליו תחמושת.</p>
      </div>

      {/* Stock table — all warehouses as columns */}
      <div className="card space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <input className="input max-w-xs" placeholder="🔍 סינון פריט..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <span className="badge bg-emerald-50 text-emerald-700">{rows.length} פריטים</span>
        </div>
        <div className="table-wrap card p-0 overflow-x-auto">
          <table className="table-base !w-auto mx-auto">
            <thead>
              <tr>
                <th className="text-right">פריט</th>
                {warehouses.map((w, i) => (
                  <th key={w.id} className={`text-center ${COL_ACCENTS[i % COL_ACCENTS.length].split(' ')[0]}`}>{w.name}</th>
                ))}
                <th className="text-center text-amber-700">סה״כ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.itemId}>
                  <td className="font-medium text-right whitespace-nowrap">{r.name}</td>
                  {warehouses.map((w, i) => {
                    const q = r.perWh.get(w.id) ?? 0;
                    return (
                      <td key={w.id} className={`text-center font-bold ${COL_ACCENTS[i % COL_ACCENTS.length]}`}>
                        {q > 0 ? q.toLocaleString('he-IL') : <span className="text-slate-300">—</span>}
                      </td>
                    );
                  })}
                  <td className="text-center font-bold text-amber-700 bg-amber-50/40">{r.total.toLocaleString('he-IL')}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={warehouses.length + 2} className="text-center text-slate-400 py-8 text-sm">
                    {warehouses.length === 0 ? 'אין מחסנים — צור מחסן ראשון למעלה' : 'אין מלאי להצגה'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
