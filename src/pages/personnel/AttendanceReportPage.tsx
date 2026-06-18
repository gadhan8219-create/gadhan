import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { PageTitle } from '../bunker/shared';
import {
  listStatuses, createStatus, deleteStatus, statusInUse,
  getAttendanceForDate, confirmAttendance, todayISO, MAX_STATUS_LEN,
  type AttendanceStatus, type AttendanceInput,
} from '../../lib/attendance';
import type { Unit, Team, Soldier } from '../../lib/database.types';

/**
 * שלישות → דיווח נוכחות (דוח 1).
 * Admin manages statuses and may switch between units; raspar is locked to their
 * own unit. A date picker allows editing past reports (future is blocked).
 */
export default function AttendanceReportPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isRaspar = profile?.role === 'raspar';
  const raspUnitId = profile?.unit_id ?? null;

  const [units, setUnits] = useState<Unit[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [soldiers, setSoldiers] = useState<Soldier[]>([]);
  const [statuses, setStatuses] = useState<AttendanceStatus[]>([]);

  const [unitFilter, setUnitFilter] = useState('');
  const [date, setDate] = useState(todayISO());
  const [values, setValues] = useState<Record<string, string>>({}); // soldier_id → status_id
  const [activeStatusId, setActiveStatusId] = useState(''); // status currently being assigned
  const [hasExisting, setHasExisting] = useState(false); // date already had a report
  const [openTeams, setOpenTeams] = useState<Set<string>>(new Set()); // teams start collapsed

  const [newStatus, setNewStatus] = useState('');
  const [addingStatus, setAddingStatus] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const effectiveUnitId = isAdmin ? unitFilter : (raspUnitId ?? '');
  const today = todayISO();

  // Static lookups (units, teams, statuses) once.
  useEffect(() => {
    Promise.all([
      supabase.from('units').select('*').order('name'),
      supabase.from('teams').select('*').order('name'),
      listStatuses(),
    ])
      .then(([u, t, s]) => {
        if (u.data) setUnits(u.data as Unit[]);
        if (t.data) setTeams(t.data as Team[]);
        setStatuses(s);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  // Soldiers + existing attendance for the chosen unit + date.
  useEffect(() => {
    if (!effectiveUnitId) { setSoldiers([]); setValues({}); return; }
    setLoading(true);
    setSuccess(null);
    setOpenTeams(new Set());
    Promise.all([
      supabase.from('soldiers').select('*').eq('unit_id', effectiveUnitId).order('full_name'),
      getAttendanceForDate(date),
    ])
      .then(([s, att]) => {
        const list = (s.data ?? []) as Soldier[];
        setSoldiers(list);
        const ids = new Set(list.map((x) => x.id));
        const prefill: Record<string, string> = {};
        for (const a of att) if (ids.has(a.soldier_id)) prefill[a.soldier_id] = a.status_id;
        setValues(prefill);
        setHasExisting(Object.keys(prefill).length > 0);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [effectiveUnitId, date]);

  const teamName = useMemo(() => {
    const m = new Map(teams.map((t) => [t.id, t.name]));
    return (id: string | null) => (id ? m.get(id) ?? 'ללא צוות' : 'ללא צוות');
  }, [teams]);

  // Group soldiers by team (sorted), each group sorted by name.
  const groups = useMemo(() => {
    const byTeam = new Map<string, { name: string; soldiers: Soldier[] }>();
    for (const s of soldiers) {
      const key = s.team_id ?? '__none__';
      const name = teamName(s.team_id);
      if (!byTeam.has(key)) byTeam.set(key, { name, soldiers: [] });
      byTeam.get(key)!.soldiers.push(s);
    }
    return Array.from(byTeam.values())
      .map((g) => ({ ...g, soldiers: [...g.soldiers].sort((a, b) => a.full_name.localeCompare(b.full_name, 'he')) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [soldiers, teamName]);

  const statusName = useMemo(() => {
    const m = new Map(statuses.map((s) => [s.id, s.status]));
    return (id: string | undefined) => (id ? m.get(id) ?? '—' : '');
  }, [statuses]);

  // How many soldiers are currently assigned to each status.
  const countByStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of soldiers) {
      const v = values[s.id];
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return m;
  }, [soldiers, values]);

  const reportedCount = soldiers.filter((s) => values[s.id]).length;
  const allReported = soldiers.length > 0 && reportedCount === soldiers.length;

  // Toggle a soldier under the active status (re-click removes the assignment).
  function toggleSoldier(soldierId: string) {
    if (!activeStatusId) return;
    setValues((p) => {
      const next = { ...p };
      if (next[soldierId] === activeStatusId) delete next[soldierId];
      else next[soldierId] = activeStatusId;
      return next;
    });
  }

  // Assign the active status to everyone not yet marked.
  function applyToRemaining() {
    if (!activeStatusId) return;
    setValues((p) => {
      const next = { ...p };
      for (const s of soldiers) if (!next[s.id]) next[s.id] = activeStatusId;
      return next;
    });
  }

  function toggleTeam(name: string) {
    setOpenTeams((p) => { const n = new Set(p); n.has(name) ? n.delete(name) : n.add(name); return n; });
  }

  // Assign the active status to an entire team (overwrites their current status).
  function applyToTeam(teamSoldiers: Soldier[]) {
    if (!activeStatusId) return;
    setValues((p) => {
      const next = { ...p };
      for (const s of teamSoldiers) next[s.id] = activeStatusId;
      return next;
    });
  }

  async function handleAddStatus() {
    setError(null);
    const name = newStatus.trim();
    if (!name) return;
    if (name.length > MAX_STATUS_LEN) { setError(`סטטוס מוגבל ל-${MAX_STATUS_LEN} תווים`); return; }
    if (statuses.some((s) => s.status === name)) { setError(`הסטטוס "${name}" כבר קיים`); return; }
    setAddingStatus(true);
    try {
      const created = await createStatus(name);
      setStatuses((p) => [...p, created]);
      setNewStatus('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAddingStatus(false);
    }
  }

  async function handleDeleteStatus(s: AttendanceStatus) {
    setError(null);
    try {
      if (await statusInUse(s.id)) { setError(`לא ניתן למחוק את "${s.status}" — קיימים דיווחים המשתמשים בו`); return; }
      if (!confirm(`למחוק את הסטטוס "${s.status}"?`)) return;
      await deleteStatus(s.id);
      setStatuses((p) => p.filter((x) => x.id !== s.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleConfirm() {
    setError(null);
    setSuccess(null);
    if (date > today) { setError('לא ניתן לדווח על תאריך עתידי'); return; }
    if (!allReported) {
      setError(`יש להשלים את הדיווח לכל החיילים במסגרת (${reportedCount}/${soldiers.length})`);
      return;
    }
    const records: AttendanceInput[] = soldiers.map((s) => ({ soldier_id: s.id, status_id: values[s.id] }));
    setSaving(true);
    try {
      await confirmAttendance(date, records);
      setSuccess(`הדיווח נשמר בהצלחה (${records.length} חיילים) לתאריך ${new Date(date).toLocaleDateString('he-IL')}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin && !isRaspar) return <Navigate to="/" replace />;
  if (isRaspar && !raspUnitId) {
    return <div className="card text-center text-slate-500">לא משוייכת לך מסגרת — פנה למנהל מערכת</div>;
  }

  return (
    <div className="space-y-5">
      <PageTitle title="דיווח נוכחות (דוח 1)" subtitle="דיווח שוטף על נוכחות החיילים במהלך צו המילואים" />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 ml-2">×</button>
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-emerald-700 text-sm flex justify-between">
          {success}
          <button onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-800 ml-2">×</button>
        </div>
      )}

      {/* Status management — admin only */}
      {isAdmin && (
        <div className="card space-y-3">
          <h2 className="font-bold text-slate-800">ניהול סטטוסים</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="label">סטטוס חדש <span className="text-slate-400 text-xs">(עד {MAX_STATUS_LEN} תווים)</span></label>
              <input className="input" value={newStatus} maxLength={MAX_STATUS_LEN}
                onChange={(e) => setNewStatus(e.target.value)} placeholder="לדוגמה: נוכח, חופשה, מחלה..."
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddStatus(); }} />
            </div>
            <button type="button" disabled={addingStatus} onClick={handleAddStatus} className="btn-primary">
              {addingStatus ? '…' : 'הוסף סטטוס'}
            </button>
          </div>
          {statuses.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {statuses.map((s) => (
                <span key={s.id} className="badge bg-slate-100 text-slate-700 gap-1">
                  {s.status}
                  <button type="button" onClick={() => handleDeleteStatus(s)}
                    className="text-slate-400 hover:text-red-600" title="מחק">×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scope: unit + date */}
      <div className="card space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">מסגרת</label>
            {isAdmin ? (
              <select className="input" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
                <option value="">— בחר מסגרת —</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            ) : (
              <input className="input bg-slate-50" value={units.find((u) => u.id === raspUnitId)?.name ?? '—'} disabled />
            )}
          </div>
          <div>
            <label className="label">תאריך הדיווח</label>
            <input type="date" className="input" value={date} max={today}
              onChange={(e) => setDate(e.target.value)} />
            {date < today && <p className="text-xs text-amber-600 mt-1">עריכה רטרואקטיבית של תאריך עבר</p>}
          </div>
        </div>

        {!effectiveUnitId ? (
          <p className="text-slate-400 text-center py-8 text-sm">יש לבחור מסגרת כדי להתחיל בדיווח</p>
        ) : statuses.length === 0 ? (
          <p className="text-amber-600 text-center py-8 text-sm">אין סטטוסים מוגדרים — {isAdmin ? 'הוסף סטטוס למעלה' : 'פנה למנהל מערכת'}</p>
        ) : loading ? (
          <p className="text-slate-400 text-center py-8 text-sm">טוען…</p>
        ) : soldiers.length === 0 ? (
          <p className="text-slate-400 text-center py-8 text-sm">אין חיילים במסגרת זו</p>
        ) : (
          <div className="space-y-5 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="badge bg-emerald-50 text-emerald-700">{soldiers.length} חיילים</span>
              <div className="flex items-center gap-2">
                {hasExisting && <span className="badge bg-sky-50 text-sky-700">קיים דיווח לתאריך זה — ניתן לעדכן</span>}
                <span className={`badge ${allReported ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  דווחו {reportedCount}/{soldiers.length}
                </span>
              </div>
            </div>

            {/* Step 3 — pick a status to assign */}
            <div className="space-y-2">
              <h3 className="font-bold text-slate-700 text-sm">① בחר סטטוס לסימון</h3>
              <div className="flex flex-wrap gap-2">
                {statuses.map((st) => {
                  const active = activeStatusId === st.id;
                  const c = countByStatus.get(st.id) ?? 0;
                  return (
                    <button key={st.id} type="button" onClick={() => setActiveStatusId(active ? '' : st.id)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium border transition ${
                        active ? 'bg-emerald-600 text-white border-emerald-600'
                               : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-400'
                      }`}>
                      {st.status}{c > 0 && <span className={`mr-1 ${active ? 'text-emerald-100' : 'text-slate-400'}`}>({c})</span>}
                    </button>
                  );
                })}
              </div>
              {activeStatusId ? (
                <p className="text-xs text-slate-500">
                  סמן את החיילים שהסטטוס שלהם "{statusName(activeStatusId)}".
                  <button type="button" onClick={applyToRemaining} className="text-emerald-600 hover:text-emerald-800 mr-2 underline">
                    החל על כל מי שטרם סומן
                  </button>
                </p>
              ) : (
                <p className="text-xs text-slate-400">בחר סטטוס כדי לסמן חיילים</p>
              )}
            </div>

            {/* Step 4 — mark the relevant soldiers */}
            <div className="space-y-3">
              <h3 className="font-bold text-slate-700 text-sm">② סמן את החיילים הרלוונטיים</h3>
              {groups.map((g) => {
                const teamReported = g.soldiers.filter((s) => values[s.id]).length;
                const open = openTeams.has(g.name);
                return (
                <div key={g.name} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 border-r-4 border-emerald-500 pr-2">
                    <button type="button" onClick={() => toggleTeam(g.name)}
                      className="flex items-center gap-2 font-bold text-slate-600 text-sm">
                      <span className="text-slate-400">{open ? '−' : '+'}</span>
                      {g.name} <span className="text-slate-400 font-normal">({teamReported}/{g.soldiers.length})</span>
                    </button>
                    {activeStatusId && (
                      <button type="button" onClick={() => applyToTeam(g.soldiers)}
                        className="text-xs text-emerald-600 hover:text-emerald-800 underline whitespace-nowrap">
                        סמן צוות כ״{statusName(activeStatusId)}״
                      </button>
                    )}
                  </div>
                  {open && (
                  <div className="divide-y divide-slate-100">
                    {g.soldiers.map((s) => {
                      const assigned = values[s.id];
                      const isActive = !!assigned && assigned === activeStatusId;
                      return (
                        <label key={s.id}
                          className={`flex items-center gap-3 py-2 rounded-lg ${activeStatusId ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'} ${isActive ? 'bg-emerald-50/60' : ''}`}>
                          <input type="checkbox"
                            className={`w-4 h-4 ${isActive ? 'accent-emerald-600' : 'accent-slate-400'}`}
                            disabled={!activeStatusId} checked={!!assigned} onChange={() => toggleSoldier(s.id)} />
                          <span className="flex-1 min-w-[140px]">
                            <span className="font-medium text-slate-800">{s.full_name}</span>
                            <span className="text-xs text-slate-400 mr-2">{s.personal_number}</span>
                          </span>
                          {assigned
                            ? <span className={`badge ${isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-50 text-sky-700'}`}>{statusName(assigned)}</span>
                            : <span className="badge bg-slate-100 text-slate-400">לא דווח</span>}
                        </label>
                      );
                    })}
                  </div>
                  )}
                </div>
                );
              })}
            </div>

            {/* Step 5 — summary + confirm */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <h3 className="font-bold text-slate-700 text-sm">סיכום הדיווח</h3>
              <div className="flex flex-wrap gap-2">
                {statuses.filter((st) => (countByStatus.get(st.id) ?? 0) > 0).map((st) => (
                  <span key={st.id} className="badge bg-white border border-slate-200 text-slate-700">
                    {st.status}: <b className="mr-1">{countByStatus.get(st.id)}</b>
                  </span>
                ))}
                {reportedCount < soldiers.length && (
                  <span className="badge bg-amber-50 text-amber-700">טרם דווחו: {soldiers.length - reportedCount}</span>
                )}
              </div>
              <div className="flex justify-center">
                <button type="button" disabled={saving || !allReported} onClick={handleConfirm}
                  className="btn-primary min-w-[240px] disabled:opacity-40">
                  {saving ? 'שומר…' : allReported ? 'אשר דוח נוכחות' : `יש לסמן את כל החיילים (${reportedCount}/${soldiers.length})`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
