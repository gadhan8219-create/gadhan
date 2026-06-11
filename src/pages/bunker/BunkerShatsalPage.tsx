import { useState } from 'react';
import { DEMO_ITEMS, ItemsGrid, PageTitle, UiOnlyNote, UNITS } from './shared';

export default function BunkerShatsalPage() {
  const [unit, setUnit] = useState('');
  const [responsible, setResponsible] = useState('');
  const [date, setDate] = useState('');
  const [search, setSearch] = useState('');
  const [values, setValues] = useState<Record<string, number>>({});

  const items = DEMO_ITEMS.filter((i) => !search || i.label.includes(search));
  const ready = unit && responsible.trim();

  return (
    <div className="space-y-5">
      <PageTitle icon="🔴" title="שצ״ל — דיווח שימוש בתחמושת" />
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
            <label className="label">אחראי דיווח</label>
            <input className="input" value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="שם מלא..." />
          </div>
          <div>
            <label className="label">תאריך ביצוע <span className="text-slate-400 text-xs">(ברירת מחדל: היום)</span></label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {ready ? (
          <>
            <input className="input max-w-xs" placeholder="🔍 סינון פריט..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <ItemsGrid items={items} values={values} onChange={(k, v) => setValues((p) => ({ ...p, [k]: v }))} accent="red" />
            <div className="flex justify-center">
              <button type="button" className="btn-primary min-w-[200px] !bg-red-600 hover:!bg-red-700">🔴 שמור דיווח שצ״ל</button>
            </div>
          </>
        ) : (
          <p className="text-slate-400 text-center py-8 text-sm">יש לבחור מסגרת ואחראי כדי להמשיך</p>
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="font-bold text-slate-800">🎖️ שצ״ל גדוד — כמות לפי פריט</h2>
        <div className="table-wrap card p-0 overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>פריט</th><th className="text-center">כמות</th></tr></thead>
            <tbody>
              <tr><td colSpan={2} className="text-center text-slate-400 py-8 text-sm">אין דיווחים להצגה</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-bold text-slate-800">📊 סיכום שצ״ל לפי מסגרת</h2>
        <div className="table-wrap card p-0 overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>מסגרת</th><th>פריט</th><th className="text-center">כמות</th><th>תאריך</th></tr></thead>
            <tbody>
              <tr><td colSpan={4} className="text-center text-slate-400 py-8 text-sm">אין נתונים להצגה</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
