import { useState } from 'react';
import { DEMO_ITEMS, ItemsGrid, PageTitle, UiOnlyNote, WAREHOUSES, stockFor } from './shared';

export default function BunkerRegulatePage() {
  const [warehouse, setWarehouse] = useState('');
  const [target, setTarget] = useState('');
  const [responsible, setResponsible] = useState('');
  const [search, setSearch] = useState('');
  const [values, setValues] = useState<Record<string, number>>({});

  const items = DEMO_ITEMS.filter((i) => !search || i.label.includes(search));
  const ready = warehouse && target.trim() && responsible.trim();

  return (
    <div className="space-y-5">
      <PageTitle icon="⚖️" title="וויסות תחמושת" />
      <UiOnlyNote />

      <div className="card space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">מחסן מקור</label>
            <select className="input" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
              <option value="">— בחר מחסן —</option>
              {WAREHOUSES.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">יעד (טקסט חופשי)</label>
            <input className="input" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="לאן המלאי עובר..." />
          </div>
          <div>
            <label className="label">אחראי ביצוע</label>
            <input className="input" value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="שם מלא..." />
          </div>
        </div>

        {ready ? (
          <>
            <input className="input max-w-xs" placeholder="🔍 סינון פריט..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <ItemsGrid
              items={items}
              values={values}
              onChange={(k, v) => setValues((p) => ({ ...p, [k]: v }))}
              stockOf={(it) => stockFor(it, warehouse)}
            />
            <div className="flex justify-center">
              <button type="button" className="btn-primary min-w-[200px]">⚖️ בצע וויסות</button>
            </div>
          </>
        ) : (
          <p className="text-slate-400 text-center py-8 text-sm">יש לבחור מחסן, יעד ואחראי כדי להמשיך</p>
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="font-bold text-slate-800">📋 היסטוריית וויסותים</h2>
        <div className="table-wrap card p-0 overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr><th>תאריך</th><th>מחסן</th><th>יעד</th><th>פריט</th><th>כמות</th><th>אחראי</th></tr>
            </thead>
            <tbody>
              <tr><td colSpan={6} className="text-center text-slate-400 py-8 text-sm">אין וויסותים להצגה</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
