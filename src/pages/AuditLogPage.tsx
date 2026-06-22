import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { AUDIT_CATEGORIES, AUDIT_ACTIONS, type AuditCategory } from '../lib/audit';

interface Row {
  id: string;
  performerName: string;
  soldier_name: string | null;
  category: string | null;
  action_type: string | null;
  items: string[] | null;
  created_at: string;
}

const PAGE_SIZES = [25, 50, 100, 200, 500];

/**
 * ניהול מערכת → יומן ביקורת.
 * On-demand query over the structured audit rows. Filter by category + action
 * type, choose how many rows to pull, and fetch only when asked.
 */
export default function AuditLogPage() {
  const [category, setCategory] = useState<AuditCategory | ''>('');
  const [actionType, setActionType] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchRows() {
    setLoading(true); setError(null);
    try {
      let q = supabase
        .from('audit_logs')
        .select('id, performed_by, soldier_name, category, action_type, items, created_at')
        .not('category', 'is', null)
        .order('created_at', { ascending: false })
        .limit(pageSize);
      if (category) q = q.eq('category', category);
      if (actionType) q = q.eq('action_type', actionType);
      const { data, error: e } = await q;
      if (e) throw e;
      const raw = (data ?? []) as Array<{ id: string; performed_by: string | null; soldier_name: string | null; category: string | null; action_type: string | null; items: string[] | null; created_at: string }>;
      const ids = [...new Set(raw.map((r) => r.performed_by).filter(Boolean) as string[])];
      const profs = ids.length ? (await supabase.from('profiles').select('id, full_name').in('id', ids)).data ?? [] : [];
      const nameMap = new Map(profs.map((p) => [p.id as string, p.full_name as string]));
      setRows(raw.map((r) => ({
        id: r.id,
        performerName: r.performed_by ? (nameMap.get(r.performed_by) ?? '—') : '—',
        soldier_name: r.soldier_name,
        category: r.category,
        action_type: r.action_type,
        items: r.items,
        created_at: r.created_at,
      })));
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  const actionOptions = category ? AUDIT_ACTIONS[category] : [];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl md:text-2xl font-bold">יומן ביקורת</h2>
        <p className="text-slate-500 text-sm mt-1">שליפת פעולות לפי דרישה</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex justify-between">
          {error}<button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 ml-2">×</button>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">קטגוריה</label>
            <select className="input" value={category}
              onChange={(e) => { setCategory(e.target.value as AuditCategory | ''); setActionType(''); }}>
              <option value="">כל הקטגוריות</option>
              {AUDIT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">סוג פעולה</label>
            <select className="input" value={actionType} disabled={!category} onChange={(e) => setActionType(e.target.value)}>
              <option value="">כל הפעולות</option>
              {actionOptions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="label">כמות</label>
            <select className="input" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <button type="button" onClick={fetchRows} disabled={loading} className="btn-primary">
            {loading ? 'שולף…' : 'שלוף'}
          </button>
        </div>
      </div>

      {/* Results */}
      {rows === null ? (
        <div className="card text-center text-slate-400 py-10 text-sm">בחר סינון ולחץ "שלוף"</div>
      ) : rows.length === 0 ? (
        <div className="card text-center text-slate-400 py-10 text-sm">לא נמצאו פעולות</div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>שם המבצע</th><th>תאריך</th><th>שם החייל</th><th>קטגוריה</th><th>סוג פעולה</th><th>פריטים</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap font-medium">{r.performerName}</td>
                  <td className="whitespace-nowrap text-xs text-slate-600">{new Date(r.created_at).toLocaleString('he-IL')}</td>
                  <td className="whitespace-nowrap">{r.soldier_name ?? '—'}</td>
                  <td>{r.category ?? '—'}</td>
                  <td>{r.action_type ?? '—'}</td>
                  <td className="text-xs text-slate-600">{r.items && r.items.length ? r.items.join(', ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
