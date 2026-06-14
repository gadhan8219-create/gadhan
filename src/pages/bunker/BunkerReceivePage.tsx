import { Fragment, useEffect, useMemo, useState } from 'react';
import { HistoryControls, ItemsGrid, PageTitle } from './shared';
import {
  listWarehouses, listItems, createItem, applyReceipt, recentReceipts,
  type BunkerWarehouse, type BunkerItem, type BunkerReceipt, type ReceiptItem,
} from '../../lib/bunker';

export default function BunkerReceivePage() {
  const [warehouses, setWarehouses] = useState<BunkerWarehouse[]>([]);
  const [items, setItems] = useState<BunkerItem[]>([]);
  const [receipts, setReceipts] = useState<BunkerReceipt[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [warehouseId, setWarehouseId] = useState('');
  const [receiver, setReceiver] = useState('');
  const [source, setSource] = useState('');

  const [newItem, setNewItem] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [search, setSearch] = useState('');
  const [values, setValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [limit, setLimit] = useState(5);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listWarehouses(), listItems()])
      .then(([w, i]) => { setWarehouses(w); setItems(i); })
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    if (!warehouseId) { setReceipts([]); return; }
    recentReceipts(warehouseId, limit).then(setReceipts).catch((e) => setError((e as Error).message));
  }, [warehouseId, limit]);

  const gridItems = useMemo(
    () => items.map((i) => ({ key: i.id, label: i.name }))
      .filter((g) => !search || g.label.includes(search)),
    [items, search],
  );

  const ready = warehouseId && receiver.trim();

  async function handleAddItem() {
    setError(null);
    const name = newItem.trim();
    if (!name) return;
    if (items.some((i) => i.name === name)) { setError(`פריט "${name}" כבר קיים`); return; }
    setAddingItem(true);
    try {
      const created = await createItem(name);
      setItems((p) => [...p, created]);
      setNewItem('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAddingItem(false);
    }
  }

  async function handleConfirm() {
    setError(null);
    const picked: ReceiptItem[] = items
      .filter((i) => (values[i.id] ?? 0) > 0)
      .map((i) => ({ item_id: i.id, name: i.name, quantity: values[i.id] }));
    if (picked.length === 0) { setError('יש להזין כמות לפריט אחד לפחות'); return; }
    setSaving(true);
    try {
      await applyReceipt(warehouseId, receiver.trim(), source.trim(), picked);
      setValues({});
      setSearch('');
      const fresh = await recentReceipts(warehouseId, limit);
      setReceipts(fresh);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const fmt = (s: string) => new Date(s).toLocaleString('he-IL');

  return (
    <div className="space-y-5">
      <PageTitle title="קבלת תחמושת" subtitle="קליטת תחמושת ממקור חיצוני למחסן" />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 ml-2">×</button>
        </div>
      )}

      <div className="card space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">מחסן יעד</label>
            <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">— בחר מחסן —</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">מי מקבל את הסחורה</label>
            <input className="input" value={receiver} onChange={(e) => setReceiver(e.target.value)} placeholder="שם מלא..." />
          </div>
          <div>
            <label className="label">מקור <span className="text-slate-400 text-xs">(מאיפה הגיעה)</span></label>
            <input className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="מקור הסחורה..." />
          </div>
        </div>

        {ready ? (
          <div className="space-y-4 border-t border-slate-200 pt-4">
            {/* Add item */}
            <div className="space-y-2">
              <h3 className="font-bold text-slate-700 text-sm">הוספת פריט חדש</h3>
              <div className="flex flex-wrap items-end gap-3">
                <input className="input flex-1 min-w-[200px]" value={newItem}
                  onChange={(e) => setNewItem(e.target.value)} placeholder="שם הפריט..." />
                <button type="button" disabled={addingItem} onClick={handleAddItem} className="btn-secondary">
                  {addingItem ? '…' : 'הוסף פריט'}
                </button>
              </div>
            </div>

            {/* Item quantities */}
            <div className="space-y-2">
              <input className="input max-w-xs" placeholder="סינון פריט..." value={search} onChange={(e) => setSearch(e.target.value)} />
              {gridItems.length === 0 ? (
                <p className="text-slate-400 text-center py-6 text-sm">
                  {items.length === 0 ? 'אין פריטים — הוסף פריט ראשון למעלה' : 'לא נמצאו פריטים'}
                </p>
              ) : (
                <ItemsGrid items={gridItems} values={values}
                  onChange={(k, v) => setValues((p) => ({ ...p, [k]: v }))} />
              )}
            </div>

            <div className="flex justify-center">
              <button type="button" disabled={saving} onClick={handleConfirm} className="btn-primary min-w-[200px]">
                {saving ? 'שומר…' : 'אשר קבלה'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-slate-400 text-center py-8 text-sm">יש לבחור מחסן ומקבל כדי להמשיך</p>
        )}
      </div>

      {/* Recent receipts */}
      {warehouseId && (
        <div className="card space-y-3">
          <h2 className="font-bold text-slate-800">קבלות אחרונות</h2>
          <HistoryControls limit={limit} onLimitChange={setLimit} count={receipts.length} label="קבלות" />
          <div className="table-wrap card p-0 overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>תאריך קבלה</th><th>מקבל</th><th>מקור</th><th>פריטים</th></tr>
              </thead>
              <tbody>
                {receipts.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-slate-400 py-8 text-sm">אין קבלות להצגה</td></tr>
                )}
                {receipts.map((r) => (
                  <Fragment key={r.id}>
                    <tr>
                      <td className="text-xs text-slate-500">{fmt(r.received_at)}</td>
                      <td>{r.receiver}</td>
                      <td>{r.source ?? '—'}</td>
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
        </div>
      )}
    </div>
  );
}
