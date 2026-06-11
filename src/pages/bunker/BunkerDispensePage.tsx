import { useState } from 'react';
import { DEMO_ITEMS, ItemsGrid, PageTitle, UiOnlyNote, UNITS, WAREHOUSES, stockFor } from './shared';

export default function BunkerDispensePage() {
  const [warehouse, setWarehouse] = useState('');
  const [unit, setUnit] = useState('');
  const [by, setBy] = useState('');
  const [search, setSearch] = useState('');
  const [values, setValues] = useState<Record<string, number>>({});

  const items = DEMO_ITEMS.filter((i) => !search || i.label.includes(search));

  return (
    <div className="space-y-5">
      <PageTitle icon="⬇️" title="ניפוק לפי מסגרת" />
      <UiOnlyNote />

      <div className="card space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">מחסן</label>
            <select className="input" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
              <option value="">— בחר מחסן —</option>
              {WAREHOUSES.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">מסגרת</label>
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">— בחר מסגרת —</option>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="label">שם מלא</label>
            <input className="input" value={by} onChange={(e) => setBy(e.target.value)} placeholder="שם המנפק..." />
          </div>
        </div>

        {unit ? (
          <>
            <input className="input max-w-xs" placeholder="🔍 סינון פריט..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <ItemsGrid
              items={items}
              values={values}
              onChange={(k, v) => setValues((p) => ({ ...p, [k]: v }))}
              stockOf={(it) => stockFor(it, warehouse)}
            />
            <div className="flex justify-center">
              <button type="button" className="btn-primary min-w-[200px]">✅ בצע ניפוק</button>
            </div>
          </>
        ) : (
          <p className="text-slate-400 text-center py-8 text-sm">יש לבחור מסגרת כדי להמשיך</p>
        )}
      </div>

      {/* History */}
      <div className="card space-y-3">
        <h2 className="font-bold text-slate-800">📋 היסטוריית ניפוקים</h2>
        <div className="flex flex-wrap gap-3">
          <select className="input max-w-[180px]">
            <option value="">כל המסגרות</option>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <input type="date" className="input max-w-[180px]" />
        </div>
        <div className="table-wrap card p-0 overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr><th>תאריך</th><th>מסגרת</th><th>פריט</th><th>כמות</th><th>מנפק</th></tr>
            </thead>
            <tbody>
              <tr><td colSpan={5} className="text-center text-slate-400 py-8 text-sm">אין ניפוקים להצגה</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
