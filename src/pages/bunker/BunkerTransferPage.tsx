import { Fragment, useEffect, useMemo, useState } from 'react';
import { LiveItemsGrid, PageTitle, type LiveItem } from './shared';
import {
  listWarehouses, listItems, listStock, applyTransfer, recentTransfers,
  type BunkerWarehouse, type BunkerItem, type BunkerStockRow, type BunkerTransfer, type ReceiptItem,
} from '../../lib/bunker';

export default function BunkerTransferPage() {
  const [warehouses, setWarehouses] = useState<BunkerWarehouse[]>([]);
  const [items, setItems] = useState<BunkerItem[]>([]);
  const [stock, setStock] = useState<BunkerStockRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [originId, setOriginId] = useState('');
  const [destId, setDestId] = useState('');
  const [inCharge, setInCharge] = useState('');
  const [search, setSearch] = useState('');
  const [values, setValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const [transfers, setTransfers] = useState<BunkerTransfer[]>([]);
  const [limit, setLimit] = useState(5);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listWarehouses(), listItems()])
      .then(([w, i]) => { setWarehouses(w); setItems(i); })
      .catch((e) => setError((e as Error).message));
  }, []);

  // Available items come from the SOURCE warehouse (you can only move what it holds).
  useEffect(() => {
    if (!originId) { setStock([]); return; }
    setValues({});
    listStock(originId).then(setStock).catch((e) => setError((e as Error).message));
  }, [originId]);

  useEffect(() => {
    if (!originId) { setTransfers([]); return; }
    recentTransfers(originId, limit).then(setTransfers).catch((e) => setError((e as Error).message));
  }, [originId, limit]);

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

  const sameWarehouse = originId && destId && originId === destId;
  const ready = originId && destId && !sameWarehouse && inCharge.trim();

  async function handleTransfer() {
    setError(null);
    const picked: ReceiptItem[] = Object.entries(values)
      .filter(([, q]) => q > 0)
      .map(([id, q]) => ({ item_id: id, name: itemName(id), quantity: q }));
    if (picked.length === 0) { setError('יש להזין כמות לפריט אחד לפחות'); return; }
    setSaving(true);
    try {
      await applyTransfer(originId, destId, inCharge.trim(), picked);
      setValues({});
      setSearch('');
      const [s, t] = await Promise.all([listStock(originId), recentTransfers(originId, limit)]);
      setStock(s); setTransfers(t);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const fmt = (s: string) => new Date(s).toLocaleString('he-IL');
  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? '—';

  return (
    <div className="space-y-5">
      <PageTitle icon="🔄" title="העברה בין מחסנים" subtitle="העברת תחמושת פנימית בין מחסני היחידה" />

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
            <select className="input" value={originId} onChange={(e) => setOriginId(e.target.value)}>
              <option value="">— בחר מחסן —</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">מחסן יעד</label>
            <select className="input" value={destId} onChange={(e) => setDestId(e.target.value)}>
              <option value="">— בחר מחסן —</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">שם המעביר</label>
            <input className="input" value={inCharge} onChange={(e) => setInCharge(e.target.value)} placeholder="שם מלא..." />
          </div>
        </div>

        {sameWarehouse && (
          <p className="text-red-600 text-sm">מחסן המקור והיעד חייבים להיות שונים</p>
        )}

        {ready ? (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-slate-500 text-sm">פריטים זמינים מתוך מחסן המקור:</p>
            <input className="input max-w-xs" placeholder="🔍 סינון פריט..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <LiveItemsGrid items={gridItems} values={values} cap
              onChange={(id, v) => setValues((p) => ({ ...p, [id]: v }))} />
            <div className="flex justify-center">
              <button type="button" disabled={saving} onClick={handleTransfer} className="btn-primary min-w-[200px]">
                {saving ? 'מעביר…' : '🔄 אשר העברה'}
              </button>
            </div>
          </div>
        ) : (
          !sameWarehouse && <p className="text-slate-400 text-center py-8 text-sm">יש לבחור מחסן מקור, יעד ומעביר כדי להמשיך</p>
        )}
      </div>

      {/* History */}
      {originId && (
        <div className="card space-y-3">
          <h2 className="font-bold text-slate-800">📋 העברות אחרונות — {whName(originId)}</h2>
          <div className="table-wrap card p-0 overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>תאריך</th><th>מקור</th><th>יעד</th><th>מבצע</th><th>פריטים</th></tr>
              </thead>
              <tbody>
                {transfers.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-slate-400 py-8 text-sm">אין העברות להצגה</td></tr>
                )}
                {transfers.map((t) => (
                  <Fragment key={t.id}>
                    <tr>
                      <td className="text-xs text-slate-500">{fmt(t.transferred_at)}</td>
                      <td>{whName(t.origin_warehouse_id)}</td>
                      <td>{whName(t.destination_warehouse_id)}</td>
                      <td>{t.in_charge}</td>
                      <td>
                        <button type="button" onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                          className="text-blue-600 hover:text-blue-800 text-sm">
                          {expanded === t.id ? 'הסתר' : `הצג (${t.items.length})`}
                        </button>
                      </td>
                    </tr>
                    {expanded === t.id && (
                      <tr>
                        <td colSpan={5} className="bg-slate-50">
                          <div className="flex flex-wrap gap-2 py-1">
                            {t.items.map((it, idx) => (
                              <span key={idx} className="badge bg-emerald-50 text-emerald-700">
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
          {transfers.length >= limit && (
            <div className="flex justify-center">
              <button type="button" onClick={() => setLimit((n) => n + 5)} className="btn-secondary">הצג עוד</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
