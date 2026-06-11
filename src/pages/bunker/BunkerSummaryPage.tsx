import { useState } from 'react';
import { PageTitle, UiOnlyNote, UNITS } from './shared';

export default function BunkerSummaryPage() {
  const [unit, setUnit] = useState('');

  return (
    <div className="space-y-5">
      <PageTitle icon="📊" title="סיכום ניפוקים מול שצ״ל" />
      <UiOnlyNote />

      <div className="card space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="label">מסגרת</label>
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">כל המסגרות</option>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <button type="button" className="btn-primary">📊 טען סיכום</button>
        </div>

        <div className="table-wrap card p-0 overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>פריט</th>
                <th className="text-center">נופק</th>
                <th className="text-center">שצ״ל</th>
                <th className="text-center">נטו</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={4} className="text-center text-slate-400 py-8 text-sm">טען סיכום כדי לראות נתונים</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
