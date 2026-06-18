import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { PageTitle } from '../bunker/shared';
import type { Unit } from '../../lib/database.types';
import {
  listRequirements,
  deleteRequirements,
  type ManeuverRequirement,
} from '../../lib/maneuver';

/**
 * תמרון → משטח עבודה.
 * Pick a מסגרת, see its requirements grouped by category (collapsible checklists),
 * tick the ones handled, copy them to WhatsApp, and clear (delete) the ticked ones.
 */
export default function ManeuverWorkPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isRaspar = profile?.role === 'raspar';
  const raspUnitId = profile?.unit_id ?? null;

  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState('');
  const [reqs, setReqs] = useState<ManeuverRequirement[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const effectiveUnit = isAdmin ? unitId : (raspUnitId ?? '');

  useEffect(() => {
    supabase.from('units').select('*').order('name').then(({ data }) => {
      if (data) setUnits(data as Unit[]);
    });
  }, []);

  async function reload() {
    if (!effectiveUnit) { setReqs([]); return; }
    try { setReqs(await listRequirements(effectiveUnit)); }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => {
    setChecked(new Set());
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUnit]);

  // Group requirements by category, preserving insertion order.
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; rows: ManeuverRequirement[] }>();
    for (const r of reqs) {
      const g = map.get(r.category_id) ?? { name: r.categoryName, rows: [] };
      g.rows.push(r);
      map.set(r.category_id, g);
    }
    return [...map.entries()].map(([id, g]) => ({ id, ...g }));
  }, [reqs]);

  function toggle(id: string) {
    setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleCat(id: string) {
    setOpenCats((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function copyWhatsapp() {
    // Copy ALL requirements (not only the checked ones), grouped by category.
    const lines: string[] = [];
    for (const g of groups) {
      if (g.rows.length === 0) continue;
      lines.push(`*${g.name}*`);
      for (const r of g.rows) lines.push(`- ${r.requirement}`);
      lines.push('');
    }
    const text = lines.join('\n').trim();
    if (!text) { setError('אין דרישות להעתקה'); return; }
    navigator.clipboard.writeText(text)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => setError('העתקה נכשלה'));
  }

  async function finish() {
    const ids = [...checked];
    if (ids.length === 0) { setError('לא סומנו דרישות'); return; }
    if (!confirm(`למחוק ${ids.length} דרישות שסומנו?`)) return;
    setBusy(true); setError(null);
    try {
      await deleteRequirements(ids);
      setChecked(new Set());
      await reload();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  if (!isAdmin && !isRaspar) return <Navigate to="/" replace />;
  if (isRaspar && !raspUnitId) {
    return <div className="card text-center text-slate-500">לא משוייכת לך מסגרת — פנה למנהל מערכת</div>;
  }

  return (
    <div className="space-y-5">
      <PageTitle title="משטח עבודה" subtitle="דרישות תמרון לפי קטגוריה — סימון, העתקה וסיום" />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 ml-2">×</button>
        </div>
      )}

      {isAdmin && (
        <div className="card">
          <label className="label">מסגרת</label>
          <select className="input" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">— בחר מסגרת —</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      )}

      {effectiveUnit && (
        groups.length === 0 ? (
          <div className="card text-center text-slate-400 py-10">אין דרישות למסגרת זו</div>
        ) : (
          <>
            <div className="space-y-2">
              {groups.map((g) => {
                const open = openCats.has(g.id);
                const pickedCount = g.rows.filter((r) => checked.has(r.id)).length;
                return (
                  <div key={g.id} className="card p-0 overflow-hidden">
                    <button type="button" onClick={() => toggleCat(g.id)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition">
                      <span className="font-semibold">
                        {g.name}
                        <span className="text-xs text-slate-400 mr-2">({g.rows.length})</span>
                        {pickedCount > 0 && <span className="badge bg-emerald-100 text-emerald-700 text-xs mr-1">{pickedCount} סומנו</span>}
                      </span>
                      <span className="text-slate-400">{open ? '−' : '+'}</span>
                    </button>
                    {open && (
                      <ul className="px-4 pb-3 space-y-1 border-t border-slate-100 pt-2">
                        {g.rows.map((r) => (
                          <li key={r.id}>
                            <label className="flex items-center gap-2 cursor-pointer py-1 text-sm">
                              <input type="checkbox" className="w-4 h-4 accent-emerald-600"
                                checked={checked.has(r.id)} onChange={() => toggle(r.id)} />
                              <span>{r.requirement}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={copyWhatsapp} className="btn-secondary">
                {copied ? 'הועתק' : 'העתק לוואטסאפ'}
              </button>
              <button type="button" onClick={finish} disabled={busy} className="btn-danger">
                {busy ? '…' : 'סיום דרישות (מחיקת המסומנות)'}
              </button>
            </div>
          </>
        )
      )}
    </div>
  );
}
