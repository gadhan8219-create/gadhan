import { useState } from 'react';
import { WEAPONS_ITEMS } from '../../lib/weaponsItems';

const UNITS = ['פלוגה א', 'פלוגה ב', 'פלוגה ג', 'צמה', 'ניוד', 'מחסר', 'חפק'];

// TODO: data מ-Supabase
const MOCK_DATA: Record<string, Record<string, number>> = {};

export default function WeaponsInventoryPage() {
  const [search, setSearch] = useState('');
  const [loading] = useState(false);

  const filteredItems = WEAPONS_ITEMS.filter((item) =>
    item.label.includes(search) || item.key.toLowerCase().includes(search.toLowerCase())
  );

  const totalPerUnit = (unit: string) =>
    WEAPONS_ITEMS.reduce((sum, item) => sum + (MOCK_DATA[item.key]?.[unit] ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">מלאי נשקים</h1>
          <p className="text-slate-500 text-sm mt-1">סיכום לפי פריט ומסגרת</p>
        </div>
        <div className="flex gap-2">
          {UNITS.map((u) => (
            <span key={u} className="badge bg-slate-100 text-slate-600">{u}: {totalPerUnit(u)}</span>
          ))}
        </div>
      </div>

      <div className="card p-3">
        <input
          className="input"
          type="text"
          placeholder="🔍 חיפוש פריט..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-12">טוען נתונים...</div>
      ) : (
        <div className="table-wrap card p-0 overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>פריט</th>
                {UNITS.map((u) => <th key={u}>{u}</th>)}
                <th>סה"כ</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const rowData = MOCK_DATA[item.key] ?? {};
                const total = UNITS.reduce((s, u) => s + (rowData[u] ?? 0), 0);
                return (
                  <tr key={item.key} className={total === 0 ? 'opacity-40' : ''}>
                    <td className="font-medium text-slate-800">{item.label}</td>
                    {UNITS.map((u) => (
                      <td key={u} className="text-center">
                        {rowData[u] ? (
                          <span className="badge bg-emerald-50 text-emerald-700">{rowData[u]}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    ))}
                    <td className="text-center font-bold text-slate-700">
                      {total > 0 ? total : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-center text-slate-400">
        * הנתונים יחוברו ל-Supabase בשלב הבא
      </p>
    </div>
  );
}
