import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { PageTitle } from '../bunker/shared';
import type { Soldier, Team, Unit } from '../../lib/database.types';
import {
  listEntries,
  setEntriesForDate,
  clearEntriesForDate,
  tomorrowISO,
  type EntryMark,
} from '../../lib/maneuver';

type Mark = 'entry' | 'exit';

/**
 * תמרון → כניסות/יציאות.
 * Like דוח 1: pick a מסגרת, see soldiers grouped into collapsible teams, mark each
 * (or a whole team) as נכנס/יוצא, and submit the lists for TOMORROW.
 */
export default function ManeuverEntriesPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isRaspar = profile?.role === 'raspar';
  const raspUnitId = profile?.unit_id ?? null;

  const [units, setUnits] = useState<Unit[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [soldiers, setSoldiers] = useState<Soldier[]>([]);
  const [unitId, setUnitId] = useState('');
  const [active, setActive] = useState<Mark | ''>('');           // type currently being assigned
  const [marks, setMarks] = useState<Record<string, Mark>>({});  // soldier_id → entry/exit
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const effectiveUnit = isAdmin ? unitId : (raspUnitId ?? '');
  const date = tomorrowISO();
  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('he-IL');

  useEffect(() => {
    Promise.all([
      supabase.from('units').select('*').order('name'),
      supabase.from('teams').select('*').order('name'),
    ]).then(([u, t]) => {
      if (u.data) setUnits(u.data as Unit[]);
      if (t.data) setTeams(t.data as Team[]);
    });
  }, []);

  // Soldiers + existing marks for tomorrow.
  useEffect(() => {
    if (!effectiveUnit) { setSoldiers([]); setMarks({}); return; }
    setLoading(true); setSuccess(null);
    Promise.all([
      supabase.from('soldiers').select('*').eq('unit_id', effectiveUnit).order('full_name'),
      listEntries(effectiveUnit, date),
    ]).then(([s, entries]) => {
      const list = (s.data ?? []) as Soldier[];
      setSoldiers(list);
      const prefill: Record<string, Mark> = {};
      for (const e of entries) prefill[e.soldier_id] = e.is_entry ? 'entry' : 'exit';
      setMarks(prefill);
    }).catch((e) => setError((e as Error).message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUnit]);

  const teamName = useMemo(() => {
    const m = new Map(teams.map((t) => [t.id, t.name]));
    return (id: string | null) => (id ? m.get(id) ?? 'ללא צוות' : 'ללא צוות');
  }, [teams]);

  const groups = useMemo(() => {
    const byTeam = new Map<string, { key: string; name: string; soldiers: Soldier[] }>();
    for (const s of soldiers) {
      const key = s.team_id ?? '__none__';
      if (!byTeam.has(key)) byTeam.set(key, { key, name: teamName(s.team_id), soldiers: [] });
      byTeam.get(key)!.soldiers.push(s);
    }
    return Array.from(byTeam.values())
      .map((g) => ({ ...g, soldiers: [...g.soldiers].sort((a, b) => a.full_name.localeCompare(b.full_name, 'he')) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [soldiers, teamName]);

  const entryCount = soldiers.filter((s) => marks[s.id] === 'entry').length;
  const exitCount = soldiers.filter((s) => marks[s.id] === 'exit').length;

  function setMark(id: string, mark: Mark) {
    setMarks((p) => { const n = { ...p }; if (n[id] === mark) delete n[id]; else n[id] = mark; return n; });
  }
  function toggleSoldier(id: string) {
    if (!active) return;
    setMark(id, active);
  }
  function markTeam(teamSoldiers: Soldier[]) {
    if (!active) return;
    setMarks((p) => { const n = { ...p }; for (const s of teamSoldiers) n[s.id] = active; return n; });
  }
  function toggleCollapse(key: string) {
    setCollapsed((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  async function submit() {
    if (!effectiveUnit) { setError('נא לבחור מסגרת'); return; }
    const list: EntryMark[] = soldiers
      .filter((s) => marks[s.id])
      .map((s) => ({ soldier_id: s.id, is_entry: marks[s.id] === 'entry' }));
    setBusy(true); setError(null); setSuccess(null);
    try {
      await setEntriesForDate(effectiveUnit, date, list);
      setSuccess(`הרשימה הוזנה לתאריך ${dateLabel} (${list.length} שמות)`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function done() {
    if (!effectiveUnit) return;
    if (!confirm('למחוק את רשימות הכניסה/יציאה של המסגרת?')) return;
    setBusy(true); setError(null);
    try { await clearEntriesForDate(effectiveUnit, date); setMarks({}); setSuccess('הרשימות נמחקו'); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  if (!isAdmin && !isRaspar) return <Navigate to="/" replace />;
  if (isRaspar && !raspUnitId) {
    return <div className="card text-center text-slate-500">לא משוייכת לך מסגרת — פנה למנהל מערכת</div>;
  }

  const markBadge = (m: Mark) =>
    m === 'entry' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800';

  return (
    <div className="space-y-5">
      <PageTitle title="כניסות / יציאות" subtitle={`רשימות נכנסים ויוצאים לתאריך ${dateLabel}`} />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 ml-2">×</button>
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-emerald-800 text-sm flex justify-between">
          {success}
          <button onClick={() => setSuccess(null)} className="text-emerald-600 hover:text-emerald-900 ml-2">×</button>
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

      {!effectiveUnit ? (
        <div className="card text-center text-slate-400 py-8 text-sm">יש לבחור מסגרת</div>
      ) : loading ? (
        <div className="card text-center text-slate-400 py-8 text-sm">טוען…</div>
      ) : soldiers.length === 0 ? (
        <div className="card text-center text-slate-400 py-8 text-sm">אין חיילים במסגרת זו</div>
      ) : (
        <>
          {/* Pick type to assign */}
          <div className="card space-y-2">
            <h3 className="font-bold text-slate-700 text-sm">בחר סוג לסימון</h3>
            <div className="flex gap-2">
              {([['entry', 'נכנסים', entryCount], ['exit', 'יוצאים', exitCount]] as [Mark, string, number][]).map(([m, label, c]) => (
                <button key={m} type="button" onClick={() => setActive(active === m ? '' : m)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium border transition ${
                    active === m ? 'bg-emerald-600 text-white border-emerald-600'
                                 : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-400'
                  }`}>
                  {label}{c > 0 && <span className={`mr-1 ${active === m ? 'text-emerald-100' : 'text-slate-400'}`}>({c})</span>}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400">{active ? 'סמן חיילים או צוות שלם' : 'בחר סוג כדי לסמן'}</p>
          </div>

          {/* Teams (collapsible) */}
          <div className="space-y-2">
            {groups.map((g) => {
              const open = !collapsed.has(g.key);
              const eC = g.soldiers.filter((s) => marks[s.id] === 'entry').length;
              const xC = g.soldiers.filter((s) => marks[s.id] === 'exit').length;
              return (
                <div key={g.key} className="card p-0 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-4 py-3">
                    <button type="button" onClick={() => toggleCollapse(g.key)} className="flex items-center gap-2 font-semibold text-slate-700">
                      <span className="text-slate-400">{open ? '−' : '+'}</span>
                      {g.name}
                      <span className="text-xs text-slate-400 font-normal">({g.soldiers.length})</span>
                      {eC > 0 && <span className="badge bg-emerald-100 text-emerald-700 text-xs">נכנסים {eC}</span>}
                      {xC > 0 && <span className="badge bg-amber-100 text-amber-700 text-xs">יוצאים {xC}</span>}
                    </button>
                    {active && (
                      <button type="button" onClick={() => markTeam(g.soldiers)}
                        className="text-xs text-emerald-600 hover:text-emerald-800 underline whitespace-nowrap">
                        סמן צוות כ{active === 'entry' ? 'נכנסים' : 'יוצאים'}
                      </button>
                    )}
                  </div>
                  {open && (
                    <ul className="divide-y divide-slate-100 border-t border-slate-100">
                      {g.soldiers.map((s) => {
                        const m = marks[s.id];
                        return (
                          <li key={s.id}
                            onClick={() => toggleSoldier(s.id)}
                            className={`flex items-center justify-between gap-2 px-4 py-2 text-sm ${active ? 'cursor-pointer hover:bg-slate-50' : ''}`}>
                            <span>
                              <span className="font-medium text-slate-800">{s.full_name}</span>
                              <span className="text-xs text-slate-400 mr-2">{s.personal_number}</span>
                            </span>
                            <span className="flex gap-1">
                              {/* Per-soldier explicit toggles */}
                              <button type="button"
                                onClick={(e) => { e.stopPropagation(); setMark(s.id, 'entry'); }}
                                className={`badge text-xs ${m === 'entry' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-emerald-50'}`}>
                                נכנס
                              </button>
                              <button type="button"
                                onClick={(e) => { e.stopPropagation(); setMark(s.id, 'exit'); }}
                                className={`badge text-xs ${m === 'exit' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-amber-50'}`}>
                                יוצא
                              </button>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-2">
              <span className={`badge ${markBadge('entry')}`}>נכנסים {entryCount}</span>
              <span className={`badge ${markBadge('exit')}`}>יוצאים {exitCount}</span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={done} disabled={busy} className="btn-secondary">בוצע (מחיקה)</button>
              <button type="button" onClick={submit} disabled={busy} className="btn-primary">
                {busy ? '…' : 'הזן רשימה (למחר)'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
