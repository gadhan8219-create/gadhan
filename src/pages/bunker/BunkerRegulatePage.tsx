import { Fragment, useEffect, useMemo, useState } from 'react';
import { HistoryControls, LiveItemsGrid, PageTitle, type LiveItem } from './shared';
import {
  listWarehouses, listItems, listStock, applyRegulation, recentRegulations,
  type BunkerWarehouse, type BunkerItem, type BunkerStockRow, type BunkerRegulation, type ReceiptItem,
} from '../../lib/bunker';

export default function BunkerRegulatePage() {
  const [warehouses, setWarehouses] = useState<BunkerWarehouse[]>([]);
  const [items, setItems] = useState<BunkerItem[]>([]);
  const [stock, setStock] = useState<BunkerStockRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [warehouseId, setWarehouseId] = useState('');
  const [target, setTarget] = useState('');
  const [performer, setPerformer] = useState('');
  const [search, setSearch] = useState('');
  const [values, setValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const [regulations, setRegulations] = useState<BunkerRegulation[]>([]);
  const [limit, setLimit] = useState(5);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listWarehouses(), listItems()])
      .then(([w, i]) => { setWarehouses(w); setItems(i); })
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    if (!warehouseId) { setStock([]); return; }
    setValues({});
    listStock(warehouseId).then(setStock).catch((e) => setError((e as Error).message));
  }, [warehouseId]);

  useEffect(() => {
    if (!warehouseId) { setRegulations([]); return; }
    recentRegulations(warehouseId, limit).then(setRegulations).catch((e) => setError((e as Error).message));
  }, [warehouseId, limit]);

  const itemName = useMemo(() => {
    const m = new Map(items.map((i) => [i.id, i.name]));
    return (id: string) => m.get(id) ?? '—';
  }, [items]);

  const available = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stock) m.set(s.item_id, s.quantity);
    return m;
  }, [stock]);

  const gridItems: LiveItem[] = useMemo(
    () => items
      .map((i) => ({ id: i.id, name: i.name, available: available.get(i.id) ?? 0 }))
      .filter((g) => g.available > 0)
      .filter((g) => !search || g.name.includes(search)),
    [items, available, search],
  );

  const ready = warehouseId && target.trim() && performer.trim();

  async function handleRegulate() {
    setError(null);
    const picked: ReceiptItem[] = Object.entries(values)
      .filter(([, q]) => q > 0)
      .map(([id, q]) => ({ item_id: id, name: itemName(id), quantity: q }));
    if (picked.length === 0) { setError('יש להזין כמות לפריט אחד לפחות'); return; }
    setSaving(true);
    try {
      await applyRegulation(warehouseId, target.trim(), performer.trim(), picked);
      setValues({});
      setSearch('');
      const [s, r] = await Promise.all([listStock(warehouseId), recentRegulations(warehouseId, limit)]);
      setStock(s); setRegulations(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const fmt = (s: string) => new Date(s).toLocaleString('he-IL');

  return (
    <div className="space-y-5">
      <PageTitle title="וויסות תחמושת" subtitle="הוצאת תחמושת מאיתנו אל גורמים חיצוניים" />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 ml-2">×</button>
        </div>
      )}

      <div className="card space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">מחסן מקור</label>
            <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">— בחר מחסן —</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">יעד (טקסט חופשי)</label>
            <input className="input" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="לאן המלאי עובר..." />
          </div>
          <div>
            <label className="label">מבצע</label>
            <input className="input" value={performer} onChange={(e) => setPerformer(e.target.value)} placeholder="שם מלא..." />
          </div>
        </div>

        {ready ? (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <input className="input max-w-xs" placeholder="סינון פריט..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <LiveItemsGrid items={gridItems} values={values} cap accent="red"
              onChange={(id, v) => setValues((p) => ({ ...p, [id]: v }))} />
            <div className="flex justify-center">
              <button type="button" disabled={saving} onClick={handleRegulate} className="btn-primary min-w-[200px]">
                {saving ? 'מבצע…' : 'בצע וויסות'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-slate-400 text-center py-8 text-sm">יש לבחור מחסן, יעד ומבצע כדי להמשיך</p>
        )}
      </div>

      {/* History */}
      {warehouseId && (
        <div className="card space-y-3">
          <h2 className="font-bold text-slate-800">וויסותים אחרונים</h2>
          <HistoryControls limit={limit} onLimitChange={setLimit} count={regulations.length} label="וויסותים" />
          <div className="table-wrap card p-0 overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>תאריך</th><th>יעד</th><th>מבצע</th><th>פריטים</th></tr>
              </thead>
              <tbody>
                {regulations.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-slate-400 py-8 text-sm">אין וויסותים להצגה</td></tr>
                )}
                {regulations.map((r) => (
                  <Fragment key={r.id}>
                    <tr>
                      <td className="text-xs text-slate-500">{fmt(r.regulated_at)}</td>
                      <td>{r.target}</td>
                      <td>{r.performer}</td>
                      <td>
                        <button type="button" onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                          className="text-blue-600 hover:text-blue-800 text-sm">
                          {expanded === r.id ? 'הסתר' : `הצג (${r.items.length})`}
                        </button>
                      </td>
                    </tr>
                    {expanded === r.id && (
                      <tr>
                        <td colSpan={4} className="bg-slate-50">
                          <div className="flex flex-wrap gap-2 py-1">
                            {r.items.map((it, idx) => (
                              <span key={idx} className="badge bg-red-50 text-red-700">
                                {it.name}: {it.quantity.toLocaleString('he-IL')}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
