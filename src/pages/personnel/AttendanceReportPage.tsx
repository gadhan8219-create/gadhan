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

  const reportedCount = soldiers.filter((s) => values[s.id]).length;
  const allReported = soldiers.length > 0 && reportedCount === soldiers.length;

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
      <PageTitle icon="🧾" title="דיווח נוכחות (דוח 1)" subtitle="דיווח שוטף על נוכחות החיילים במהלך צו המילואים" />

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
          <h2 className="font-bold text-slate-800">🏷️ ניהול סטטוסים</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="label">סטטוס חדש <span className="text-slate-400 text-xs">(עד {MAX_STATUS_LEN} תווים)</span></label>
              <input className="input" value={newStatus} maxLength={MAX_STATUS_LEN}
                onChange={(e) => setNewStatus(e.target.value)} placeholder="לדוגמה: נוכח, חופשה, מחלה..."
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddStatus(); }} />
            </div>
            <button type="button" disabled={addingStatus} onClick={handleAddStatus} className="btn-primary">
              {addingStatus ? '…' : '➕ הוסף סטטוס'}
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
          <div className="space-y-4 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="badge bg-emerald-50 text-emerald-700">{soldiers.length} חיילים</span>
              <span className={`badge ${allReported ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                דווחו {reportedCount}/{soldiers.length}
              </span>
            </div>

            {groups.map((g) => (
              <div key={g.name} className="space-y-1.5">
                <h3 className="font-bold text-slate-600 text-sm border-r-4 border-emerald-500 pr-2">{g.name}</h3>
                <div className="divide-y divide-slate-100">
                  {g.soldiers.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 py-2 flex-wrap">
                      <div className="flex-1 min-w-[160px]">
                        <span className="font-medium text-slate-800">{s.full_name}</span>
                        <span className="text-xs text-slate-400 mr-2">{s.personal_number}</span>
                      </div>
                      <select className={`input !w-auto min-w-[140px] ${values[s.id] ? '' : 'text-slate-400'}`}
                        value={values[s.id] ?? ''}
                        onChange={(e) => setValues((p) => ({ ...p, [s.id]: e.target.value }))}>
                        <option value="">— בחר סטטוס —</option>
                        {statuses.map((st) => <option key={st.id} value={st.id}>{st.status}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="flex justify-center pt-2">
              <button type="button" disabled={saving} onClick={handleConfirm} className="btn-primary min-w-[220px]">
                {saving ? 'שומר…' : '✔️ אשר דוח נוכחות'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
