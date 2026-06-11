import { useEffect, useState } from 'react';
import { PageTitle } from './shared';
import { getSummary, BUNKER_UNITS, type BunkerSummaryRow } from '../../lib/bunker';

export default function BunkerSummaryPage() {
  const [unit, setUnit] = useState('');
  const [rows, setRows] = useState<BunkerSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getSummary(unit || undefined);
      setRows(data);
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Reload whenever the unit scope changes (and on first mount).
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [unit]);

  const num = (n: number) => n.toLocaleString('he-IL');

  return (
    <div className="space-y-5">
      <PageTitle icon="📊" title="סיכום תחמושת" subtitle="תמונת מצב תחמושת לפי מסגרת" />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 ml-2">×</button>
        </div>
      )}

      {/* Explanation */}
      <div className="rounded-xl bg-sky-50 border border-sky-200 px-4 py-3 text-sm text-sky-900 space-y-1">
        <p><b>סה״כ תחמושת</b> = כמה תחמושת נמצאת כרגע בשטח לפי פריט — <b>סה״כ נופק</b> פחות <b>סה״כ זוכה</b>.</p>
        <p><b>סה״כ שצ״ל</b> = סכום דיווחי השימוש לצורכי לחימה לפי פריט.</p>
        <p><b>נשאר</b> = סה״כ תחמושת פחות סה״כ שצ״ל (עשוי להיות שלילי).</p>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="label">מסגרת</label>
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">כל המסגרות</option>
              {BUNKER_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <button type="button" onClick={load} disabled={loading} className="btn-primary">
            {loading ? 'טוען…' : '📊 רענן סיכום'}
          </button>
        </div>

        <div className="table-wrap card p-0 overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-full">פריט</th>
                <th className="text-center text-emerald-700">סה״כ תחמושת</th>
                <th className="text-center text-red-700">סה״כ שצ״ל</th>
                <th className="text-center text-amber-700">נשאר</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item_id}>
                  <td className="font-medium w-full whitespace-nowrap">{r.item_name}</td>
                  <td className="text-center font-bold text-emerald-700 bg-emerald-50/40">{num(r.total_ammo)}</td>
                  <td className="text-center font-bold text-red-700 bg-red-50/40">{num(r.total_shatsal)}</td>
                  <td className={`text-center font-bold bg-amber-50/40 ${r.remaining < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                    {num(r.remaining)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={4} className="text-center text-slate-400 py-8 text-sm">
                  {loaded ? 'אין נתונים להצגה' : 'טוען…'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
