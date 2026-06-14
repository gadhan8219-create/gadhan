import { Fragment, useEffect, useMemo, useState } from 'react';
import { HistoryControls, LiveItemsGrid, PageTitle, type LiveItem } from './shared';
import {
  listItems, listUnitStock, applyShatsal, recentShatsal,
  BUNKER_UNITS,
  type BunkerItem, type BunkerUnitStockRow, type BunkerShatsal, type ReceiptItem,
} from '../../lib/bunker';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function BunkerShatsalPage() {
  const [items, setItems] = useState<BunkerItem[]>([]);
  const [unitStock, setUnitStock] = useState<BunkerUnitStockRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [unit, setUnit] = useState('');
  const [reporter, setReporter] = useState('');
  const [date, setDate] = useState(todayStr());
  const [search, setSearch] = useState('');
  const [values, setValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const [reports, setReports] = useState<BunkerShatsal[]>([]);
  const [limit, setLimit] = useState(5);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    listItems().then(setItems).catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    if (!unit) { setUnitStock([]); setReports([]); return; }
    setValues({});
    listUnitStock(unit).then(setUnitStock).catch((e) => setError((e as Error).message));
  }, [unit]);

  useEffect(() => {
    if (!unit) return;
    recentShatsal(unit, limit).then(setReports).catch((e) => setError((e as Error).message));
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

  const futureDate = date > todayStr();
  const ready = unit && reporter.trim() && date && !futureDate;

  async function handleReport() {
    setError(null);
    if (futureDate) { setError('לא ניתן לדווח שצ״ל בתאריך עתידי'); return; }
    const picked: ReceiptItem[] = Object.entries(values)
      .filter(([, q]) => q > 0)
      .map(([id, q]) => ({ item_id: id, name: itemName(id), quantity: q }));
    if (picked.length === 0) { setError('יש להזין כמות לפריט אחד לפחות'); return; }
    setSaving(true);
    try {
      await applyShatsal(unit, reporter.trim(), date, picked);
      setValues({});
      setSearch('');
      const [s, r] = await Promise.all([listUnitStock(unit), recentShatsal(unit, limit)]);
      setUnitStock(s); setReports(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const fmtDate = (s: string) => new Date(s).toLocaleDateString('he-IL');

  return (
    <div className="space-y-5">
      <PageTitle title="שצ״ל — שימוש לצורכי לחימה" subtitle="דיווח שימוש תחמושת של מסגרת" />

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
            <label className="label">אחראי דיווח</label>
            <input className="input" value={reporter} onChange={(e) => setReporter(e.target.value)} placeholder="שם מלא..." />
          </div>
          <div>
            <label className="label">תאריך ביצוע <span className="text-slate-400 text-xs">(לא עתידי)</span></label>
            <input type="date" className="input" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
            {futureDate && <p className="text-red-600 text-xs mt-1">לא ניתן לדווח בתאריך עתידי</p>}
          </div>
        </div>

        {ready ? (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-slate-500 text-sm">ניתן לדווח כמות גדולה מהזמין (המסגרת תתאפס, לא תיכנס למינוס).</p>
            <input className="input max-w-xs" placeholder="סינון פריט..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <LiveItemsGrid items={gridItems} values={values} accent="red"
              onChange={(id, v) => setValues((p) => ({ ...p, [id]: v }))} />
            <div className="flex justify-center">
              <button type="button" disabled={saving} onClick={handleReport}
                className="btn-primary min-w-[200px] !bg-red-600 hover:!bg-red-700">
                {saving ? 'שומר…' : 'דווח שצ״ל'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-slate-400 text-center py-8 text-sm">יש לבחור מסגרת, אחראי ותאריך תקין כדי להמשיך</p>
        )}
      </div>

      {/* History */}
      {unit && (
        <div className="card space-y-3">
          <h2 className="font-bold text-slate-800">דיווחי שצ״ל אחרונים — {unit}</h2>
          <HistoryControls limit={limit} onLimitChange={setLimit} count={reports.length} label="דיווחים" />
          <div className="table-wrap card p-0 overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>תאריך</th><th>מדווח</th><th>פריטים</th></tr>
              </thead>
              <tbody>
                {reports.length === 0 && (
                  <tr><td colSpan={3} className="text-center text-slate-400 py-8 text-sm">אין דיווחים להצגה</td></tr>
                )}
                {reports.map((r) => (
                  <Fragment key={r.id}>
                    <tr>
                      <td className="text-xs text-slate-500">{fmtDate(r.used_on)}</td>
                      <td>{r.reporter}</td>
                      <td>
                        <button type="button" onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                          className="text-blue-600 hover:text-blue-800 text-sm">
                          {expanded === r.id ? 'הסתר' : `הצג (${r.items.length})`}
                        </button>
                      </td>
                    </tr>
                    {expanded === r.id && (
                      <tr>
                        <td colSpan={3} className="bg-slate-50">
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
