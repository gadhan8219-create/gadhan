import { useState } from 'react';
import { DEMO_STOCK, PageTitle, UiOnlyNote } from './shared';

export default function BunkerInventoryPage() {
  const [newItem, setNewItem] = useState('');
  const [search, setSearch] = useState('');

  const visible = DEMO_STOCK.filter((s) => !search || s.label.includes(search));

  return (
    <div className="space-y-5">
      <PageTitle icon="📦" title="מלאי בונקר" subtitle="ספירת מלאי נוכחי לפי מחסן" />
      <UiOnlyNote />

      {/* Add item */}
      <div className="card space-y-3">
        <h2 className="font-bold text-slate-800">➕ הוספת פריט חדש</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="label">שם הפריט</label>
            <input className="input" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="שם הפריט..." />
          </div>
          <button type="button" className="btn-primary">➕ הוסף פריט</button>
        </div>
      </div>

      {/* Inventory table */}
      <div className="card space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <input className="input max-w-xs" placeholder="🔍 סינון פריט..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <span className="badge bg-emerald-50 text-emerald-700">{visible.length} פריטים</span>
          <button type="button" className="btn-secondary">↻ רענן</button>
        </div>
        <div className="table-wrap card p-0 overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>פריט</th>
                <th className="text-center text-emerald-700">נפתלי</th>
                <th className="text-center text-sky-700">בילו</th>
                <th className="text-center text-amber-700">סה״כ</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.key}>
                  <td className="font-medium">{s.label}</td>
                  <td className="text-center font-bold text-emerald-700 bg-emerald-50/40">{s.nafatli.toLocaleString('he-IL')}</td>
                  <td className="text-center font-bold text-sky-700 bg-sky-50/40">{s.bilo.toLocaleString('he-IL')}</td>
                  <td className="text-center font-bold text-amber-700 bg-amber-50/40">{(s.nafatli + s.bilo).toLocaleString('he-IL')}</td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={4} className="text-center text-slate-400 py-8 text-sm">לא נמצאו פריטים</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex justify-center gap-3 flex-wrap">
          <button type="button" className="btn-secondary">📤 ייצוא CSV</button>
          <button type="button" className="btn-secondary">🔄 בנה סכימה</button>
        </div>
      </div>
    </div>
  );
}
