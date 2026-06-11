import { Fragment, useEffect, useMemo, useState } from 'react';
import { HistoryControls, LiveItemsGrid, PageTitle, type LiveItem } from './shared';
import {
  listWarehouses, listItems, listUnitStock, applyCredit, recentCredits,
  BUNKER_UNITS,
  type BunkerWarehouse, type BunkerItem, type BunkerUnitStockRow, type BunkerCredit, type ReceiptItem,
} from '../../lib/bunker';

export default function BunkerCreditPage() {
  const [warehouses, setWarehouses] = useState<BunkerWarehouse[]>([]);
  const [items, setItems] = useState<BunkerItem[]>([]);
  const [unitStock, setUnitStock] = useState<BunkerUnitStockRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [unit, setUnit] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [receiver, setReceiver] = useState('');
  const [search, setSearch] = useState('');
  const [values, setValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const [credits, setCredits] = useState<BunkerCredit[]>([]);
  const [limit, setLimit] = useState(5);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listWarehouses(), listItems()])
      .then(([w, i]) => { setWarehouses(w); setItems(i); })
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    if (!unit) { setUnitStock([]); setCredits([]); return; }
    setValues({});
    listUnitStock(unit).then(setUnitStock).catch((e) => setError((e as Error).message));
  }, [unit]);

  useEffect(() => {
    if (!unit) return;
    recentCredits(unit, limit).then(setCredits).catch((e) => setError((e as Error).message));
  }, [unit, limit]);

  const itemName = useMemo(() => {
    const m = new Map(items.map((i) => [i.id, i.name]));
    return (id: string) => m.get(id) ?? '—';
  }, [items]);

  const gridItems: LiveItem[] = useMemo(
    () => unitStock
      .filter((s) => s.quantity > 0)
      .map((s) => ({ id: s.item_id, name: itemName(s.item_id), available: s.quantity }))
      .filter((g) => !search || g.name.includes(search))
      .sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [unitStock, itemName, search],
  );

  const ready = unit && warehouseId && receiver.trim();

  async function handleCredit() {
    setError(null);
    const picked: ReceiptItem[] = Object.entries(values)
      .filter(([, q]) => q > 0)
      .map(([id, q]) => ({ item_id: id, name: itemName(id), quantity: q }));
    if (picked.length === 0) { setError('יש להזין כמות לפריט אחד לפחות'); return; }
    setSaving(true);
    try {
      await applyCredit(unit, warehouseId, receiver.trim(), picked);
      setValues({});
      setSearch('');
      const [s, c] = await Promise.all([listUnitStock(unit), recentCredits(unit, limit)]);
      setUnitStock(s); setCredits(c);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const fmt = (s: string) => new Date(s).toLocaleString('he-IL');

  return (
    <div className="space-y-5">
      <PageTitle icon="⬆️" title="זיכוי תחמושת" subtitle="החזרת תחמושת ממסגרת למחסן" />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 ml-2">×</button>
        </div>
      )}

      <div className="card space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">מסגרת</label>
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">— בחר מסגרת —</option>
              {BUNKER_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="label">מחסן מזכה</label>
            <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">— בחר מחסן —</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">שם המקבל</label>
            <input className="input" value={receiver} onChange={(e) => setReceiver(e.target.value)} placeholder="שם מלא..." />
          </div>
        </div>

        {ready ? (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-slate-500 text-sm">ניתן להחזיר יותר מהכמות הזמינה.</p>
            <input className="input max-w-xs" placeholder="🔍 סינון פריט..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <LiveItemsGrid items={gridItems} values={values} accent="red"
              onChange={(id, v) => setValues((p) => ({ ...p, [id]: v }))} />
            <div className="flex justify-center">
              <button type="button" disabled={saving} onClick={handleCredit}
                className="btn-primary min-w-[200px] !bg-red-600 hover:!bg-red-700">
                {saving ? 'מזכה…' : '↩️ בצע זיכוי'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-slate-400 text-center py-8 text-sm">יש לבחור מסגרת, מחסן ומקבל כדי להמשיך</p>
        )}
      </div>

      {/* History */}
      {unit && (
        <div className="card space-y-3">
          <h2 className="font-bold text-slate-800">📜 זיכויים אחרונים — {unit}</h2>
          <HistoryControls limit={limit} onLimitChange={setLimit} count={credits.length} label="זיכויים" />
          <div className="table-wrap card p-0 overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>תאריך</th><th>מחסן</th><th>מקבל</th><th>פריטים</th></tr>
              </thead>
              <tbody>
                {credits.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-slate-400 py-8 text-sm">אין זיכויים להצגה</td></tr>
                )}
                {credits.map((c) => (
                  <Fragment key={c.id}>
                    <tr>
                      <td className="text-xs text-slate-500">{fmt(c.credited_at)}</td>
                      <td>{warehouses.find((w) => w.id === c.warehouse_id)?.name ?? '—'}</td>
                      <td>{c.receiver}</td>
                      <td>
                        <button type="button" onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                          className="text-blue-600 hover:text-blue-800 text-sm">
                          {expanded === c.id ? 'הסתר' : `הצג (${c.items.length})`}
                        </button>
                      </td>
                    </tr>
                    {expanded === c.id && (
                      <tr>
                        <td colSpan={4} className="bg-slate-50">
                          <div className="flex flex-wrap gap-2 py-1">
                            {c.items.map((it, idx) => (
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
