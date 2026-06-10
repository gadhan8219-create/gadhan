import { useState } from 'react';
import { WEAPONS_ITEMS } from '../../lib/weaponsItems';
import { useAuth } from '../../lib/auth';

type Mode = 'credit' | 'transfer' | 'swap' | 'apson';

const MODE_LABELS: Record<Mode, string> = {
  credit:   '❌ זיכוי',
  transfer: '↔️ העברה',
  swap:     '🔄 ראש-בראש',
  apson:    '📦 איפסון',
};

const MODE_COLORS: Record<Mode, string> = {
  credit:   'bg-red-600 text-white',
  transfer: 'bg-blue-700 text-white',
  swap:     'bg-teal-700 text-white',
  apson:    'bg-orange-600 text-white',
};

export default function WeaponsTransferPage() {
  const { profile } = useAuth();
  const [mode, setMode] = useState<Mode>('credit');
  const [sourcePN, setSourcePN] = useState('');
  const [targetPN, setTargetPN] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredItems = WEAPONS_ITEMS.filter((item) =>
    item.label.includes(search) || item.key.toLowerCase().includes(search.toLowerCase())
  );

  function toggleItem(key: string) {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function handleSubmit() {
    if (!sourcePN) { setError('נא להזין מספר אישי מקור'); return; }
    if ((mode === 'transfer' || mode === 'swap') && !targetPN) {
      setError('נא להזין מספר אישי יעד'); return;
    }
    if (selectedItems.size === 0) { setError('נא לבחור לפחות פריט אחד'); return; }

    setLoading(true);
    setError(null);
    // TODO: Supabase
    await new Promise((r) => setTimeout(r, 700));
    setSuccess(`${MODE_LABELS[mode]} בוצע בהצלחה — ${selectedItems.size} פריטים`);
    setSelectedItems(new Set());
    setLoading(false);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">העברה / זיכוי</h1>
        <p className="text-slate-500 text-sm mt-1">מבצע: {profile?.full_name}</p>
      </div>

      {/* Mode selector */}
      <div className="card p-2">
        <div className="grid grid-cols-4 gap-1">
          {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null); setSuccess(null); }}
              className={`rounded-lg py-2 px-1 text-sm font-bold transition ${
                mode === m ? MODE_COLORS[m] : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="card space-y-4">
        {/* Source */}
        <div>
          <label className="label">
            {mode === 'credit' ? 'מספר אישי לזיכוי' : 'מספר אישי מקור'}
          </label>
          <input
            className="input"
            type="text"
            inputMode="numeric"
            maxLength={7}
            placeholder="7 ספרות"
            value={sourcePN}
            onChange={(e) => setSourcePN(e.target.value)}
          />
        </div>

        {/* Target — only for transfer/swap */}
        {(mode === 'transfer' || mode === 'swap') && (
          <div>
            <label className="label">מספר אישי יעד</label>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              maxLength={7}
              placeholder="7 ספרות"
              value={targetPN}
              onChange={(e) => setTargetPN(e.target.value)}
            />
          </div>
        )}

        {/* Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">בחר פריטים</label>
            {selectedItems.size > 0 && (
              <span className="badge bg-emerald-100 text-emerald-700">{selectedItems.size} נבחרו</span>
            )}
          </div>
          <input
            className="input mb-2"
            type="text"
            placeholder="חיפוש..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto">
            {filteredItems.map((item) => (
              <label
                key={item.key}
                className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition text-sm ${
                  selectedItems.has(item.key)
                    ? 'border-emerald-500 bg-emerald-50 text-slate-800 font-medium'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                }`}
              >
                <input
                  type="checkbox"
                  className="accent-emerald-600 shrink-0"
                  checked={selectedItems.has(item.key)}
                  onChange={() => toggleItem(item.key)}
                />
                {item.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-emerald-700 text-sm font-medium">
          ✅ {success}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className={`w-full btn ${MODE_COLORS[mode]}`}
      >
        {loading ? 'מבצע...' : `בצע ${MODE_LABELS[mode]}`}
      </button>
    </div>
  );
}
