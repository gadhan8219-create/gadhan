import { useState } from 'react';
import { WEAPONS_ITEMS } from '../../lib/weaponsItems';
import { useAuth } from '../../lib/auth';

export default function ArmoryCountPage() {
  const { profile } = useAuth();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const filtered = WEAPONS_ITEMS.filter((item) =>
    item.label.includes(search) || item.key.toLowerCase().includes(search.toLowerCase())
  );

  const totalItems = Object.values(counts).filter((v) => v && parseInt(v) > 0).length;
  const totalQty = Object.values(counts).reduce((s, v) => s + (parseInt(v) || 0), 0);

  async function handleSave() {
    setLoading(true);
    // TODO: Supabase
    await new Promise((r) => setTimeout(r, 600));
    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="card">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">ספירה נשמרה</h2>
          <p className="text-slate-500 mb-4">
            {totalItems} פריטים · {totalQty} יחידות סה"כ
          </p>
          <p className="text-xs text-slate-400 mb-6">{profile?.full_name} · {new Date().toLocaleString('he-IL')}</p>
          <button className="btn-primary" onClick={() => { setSuccess(false); setCounts({}); }}>
            ספירה חדשה
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ספירת מלאי נשקייה</h1>
          <p className="text-slate-500 text-sm">מבצע: {profile?.full_name}</p>
        </div>
        {totalQty > 0 && (
          <div className="flex gap-2">
            <span className="badge bg-blue-100 text-blue-700">{totalItems} פריטים</span>
            <span className="badge bg-emerald-100 text-emerald-700">{totalQty} יחידות</span>
          </div>
        )}
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

      <div className="card space-y-2 p-3">
        {filtered.map((item) => (
          <div key={item.key} className="flex items-center gap-3">
            <span className="flex-1 text-sm text-slate-700">{item.label}</span>
            <input
              type="number"
              min={0}
              className="input w-20 text-center py-1.5 text-sm"
              placeholder="0"
              value={counts[item.key] ?? ''}
              onChange={(e) =>
                setCounts((c) => ({ ...c, [item.key]: e.target.value }))
              }
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={loading || totalQty === 0}
        className="btn-primary w-full"
      >
        {loading ? 'שומר...' : 'שמור ספירה'}
      </button>
    </div>
  );
}
