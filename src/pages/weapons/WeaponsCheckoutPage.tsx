import { useState } from 'react';
import { WEAPONS_ITEMS } from '../../lib/weaponsItems';
import { useAuth } from '../../lib/auth';

interface FormState {
  personalNumber: string;
  fullName: string;
  phone: string;
  unit: string;
  team: string;
  items: Record<string, boolean>;
  notes: Record<string, string>;
  signature: string;
}

const UNITS = ['פלוגה א', 'פלוגה ב', 'פלוגה ג', 'צמה', 'ניוד', 'מחסר', 'חפק'];

export default function WeaponsCheckoutPage() {
  const { profile } = useAuth();
  const [form, setForm] = useState<FormState>({
    personalNumber: '',
    fullName: '',
    phone: '',
    unit: '',
    team: '',
    items: {},
    notes: {},
    signature: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const selectedCount = Object.values(form.items).filter(Boolean).length;

  const filteredItems = WEAPONS_ITEMS.filter((item) =>
    item.label.includes(search) || item.key.includes(search)
  );

  function toggleItem(key: string) {
    setForm((f) => ({
      ...f,
      items: { ...f.items, [key]: !f.items[key] },
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.personalNumber || !form.fullName || !form.unit) {
      setError('נא למלא מספר אישי, שם מלא ומסגרת');
      return;
    }
    if (selectedCount === 0) {
      setError('נא לבחור לפחות פריט אחד');
      return;
    }
    setLoading(true);
    setError(null);
    // TODO: שמירה ל-Supabase
    await new Promise((r) => setTimeout(r, 800));
    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="card">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">הדוח נשמר בהצלחה</h2>
          <p className="text-slate-500 mb-6">
            {form.fullName} · {form.personalNumber}
            <br />
            {selectedCount} פריטים נרשמו
          </p>
          <button
            className="btn-primary"
            onClick={() => {
              setSuccess(false);
              setForm({ personalNumber: '', fullName: '', phone: '', unit: '', team: '', items: {}, notes: {}, signature: '' });
            }}
          >
            דוח חדש
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">דוח צלם מקוון</h1>
        <p className="text-slate-500 text-sm mt-1">קבלת נשק וציוד לחייל</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* פרטי חייל */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-slate-700">פרטי חייל</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">מספר אישי *</label>
              <input
                className="input"
                type="text"
                inputMode="numeric"
                maxLength={7}
                placeholder="7 ספרות"
                value={form.personalNumber}
                onChange={(e) => setForm((f) => ({ ...f, personalNumber: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label">שם מלא *</label>
              <input
                className="input"
                type="text"
                placeholder="שם פרטי ומשפחה"
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label">טלפון</label>
              <input
                className="input"
                type="tel"
                placeholder="05X-XXXXXXX"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">מסגרת *</label>
              <select
                className="input"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                required
              >
                <option value="">בחר מסגרת</option>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* בחירת פריטים */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-700">פריטים</h2>
            {selectedCount > 0 && (
              <span className="badge bg-emerald-100 text-emerald-700">{selectedCount} נבחרו</span>
            )}
          </div>

          <input
            className="input"
            type="text"
            placeholder="חיפוש פריט..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
            {filteredItems.map((item) => (
              <label
                key={item.key}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                  form.items[item.key]
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  className="accent-emerald-600"
                  checked={!!form.items[item.key]}
                  onChange={() => toggleItem(item.key)}
                />
                <span className="text-sm text-slate-700">{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* חתימה דיגיטלית */}
        <div className="card space-y-2">
          <h2 className="font-semibold text-slate-700">חתימה דיגיטלית</h2>
          <div className="border-2 border-dashed border-slate-300 rounded-lg h-24 flex items-center justify-center text-slate-400 text-sm">
            {/* TODO: canvas חתימה */}
            אזור חתימה — יצורף בשלב הבא
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        <p className="text-xs text-slate-400">
          מבצע: {profile?.full_name}
        </p>

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={loading}
        >
          {loading ? 'שומר...' : 'שמור דוח'}
        </button>
      </form>
    </div>
  );
}
