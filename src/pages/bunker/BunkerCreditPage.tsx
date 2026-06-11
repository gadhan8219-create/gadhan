import { useState } from 'react';
import { DEMO_ITEMS, PageTitle, UiOnlyNote, UNITS, WAREHOUSES } from './shared';

export default function BunkerCreditPage() {
  const [unit, setUnit] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [by, setBy] = useState('');
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // Demo: pretend the first few items are currently dispensed to the unit.
  const dispensed = DEMO_ITEMS.slice(0, 4).map((it, i) => ({ ...it, net: (i + 1) * 25 }));

  return (
    <div className="space-y-5">
      <PageTitle icon="⬆️" title="זיכוי לפי מסגרת" />
      <UiOnlyNote />

      <div className="card space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">מסגרת</label>
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">— בחר מסגרת —</option>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="label">מחסן להחזרה</label>
            <select className="input" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
              <option value="">— לפי מחסן מקורי —</option>
              {WAREHOUSES.map((w) => <option key={w.value} value={w.value}>{w.value}</option>)}
            </select>
          </div>
          <div>
            <label className="label">שם מלא</label>
            <input className="input" value={by} onChange={(e) => setBy(e.target.value)} placeholder="שם המזכה..." />
          </div>
        </div>

        {unit ? (
          <>
            <p className="text-slate-500 text-sm">בחר פריטים להחזרה:</p>
            <div className="space-y-2">
              {dispensed.map((r) => (
                <label key={r.key} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-red-600"
                    checked={!!checked[r.key]}
                    onChange={(e) => setChecked((p) => ({ ...p, [r.key]: e.target.checked }))}
                  />
                  <span className="flex-1 font-medium text-slate-700">{r.label}</span>
                  <span className="text-sm text-slate-500">נטו: <b className="text-amber-600">{r.net}</b></span>
                  <input
                    type="number"
                    min={1}
                    defaultValue={r.net}
                    disabled={!checked[r.key]}
                    className="input w-20 text-center font-bold disabled:opacity-40"
                  />
                </label>
              ))}
            </div>
            <div className="flex justify-center">
              <button type="button" className="btn-primary min-w-[200px] !bg-red-600 hover:!bg-red-700">↩️ בצע זיכוי</button>
            </div>
          </>
        ) : (
          <p className="text-slate-400 text-center py-8 text-sm">יש לבחור מסגרת כדי לראות ניפוקים פעילים</p>
        )}
      </div>

      {/* History */}
      {unit && (
        <div className="card space-y-3">
          <h2 className="font-bold text-slate-800">📜 היסטוריית זיכויים</h2>
          <div className="table-wrap card p-0 overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>תאריך</th><th>פריט</th><th>כמות</th><th>מחסן</th><th>מזכה</th></tr>
              </thead>
              <tbody>
                <tr><td colSpan={5} className="text-center text-slate-400 py-8 text-sm">אין זיכויים להצגה</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
