import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { PageTitle } from '../bunker/shared';
import { listStatuses, getAttendanceForDate, todayISO, type AttendanceStatus } from '../../lib/attendance';
import type { Unit, Team, Soldier } from '../../lib/database.types';

/**
 * שלישות → דוחות.
 * View a past day's attendance for a unit (admin switches units; raspar locked
 * to their own), sorted by team then name, with an Excel (.xlsx) export.
 */
interface ReportRow {
  unitName: string;
  teamName: string;
  soldierName: string;
  personalNumber: string;
  status: string;
}

export default function AttendanceRecordsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isRaspar = profile?.role === 'raspar';
  const raspUnitId = profile?.unit_id ?? null;

  const [units, setUnits] = useState<Unit[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [soldiers, setSoldiers] = useState<Soldier[]>([]);
  const [statuses, setStatuses] = useState<AttendanceStatus[]>([]);
  const [statusBySoldier, setStatusBySoldier] = useState<Record<string, string>>({});

  const [unitFilter, setUnitFilter] = useState('');
  const [date, setDate] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveUnitId = isAdmin ? unitFilter : (raspUnitId ?? '');
  const today = todayISO();

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

  useEffect(() => {
    if (!effectiveUnitId) { setSoldiers([]); setStatusBySoldier({}); return; }
    setLoading(true);
    Promise.all([
      supabase.from('soldiers').select('*').eq('unit_id', effectiveUnitId).order('full_name'),
      getAttendanceForDate(date),
    ])
      .then(([s, att]) => {
        const list = (s.data ?? []) as Soldier[];
        setSoldiers(list);
        const ids = new Set(list.map((x) => x.id));
        const map: Record<string, string> = {};
        for (const a of att) if (ids.has(a.soldier_id)) map[a.soldier_id] = a.status_id;
        setStatusBySoldier(map);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [effectiveUnitId, date]);

  const teamName = useMemo(() => {
    const m = new Map(teams.map((t) => [t.id, t.name]));
    return (id: string | null) => (id ? m.get(id) ?? 'ללא צוות' : 'ללא צוות');
  }, [teams]);
  const statusName = useMemo(() => {
    const m = new Map(statuses.map((s) => [s.id, s.status]));
    return (id: string | undefined) => (id ? m.get(id) ?? '—' : 'לא דווח');
  }, [statuses]);
  const unitName = useMemo(() => {
    const m = new Map(units.map((u) => [u.id, u.name]));
    return (id: string) => m.get(id) ?? '—';
  }, [units]);

  // Sorted by team → name.
  const rows = useMemo<ReportRow[]>(() => {
    return [...soldiers]
      .sort((a, b) => {
        const t = teamName(a.team_id).localeCompare(teamName(b.team_id), 'he');
        if (t !== 0) return t;
        return a.full_name.localeCompare(b.full_name, 'he');
      })
      .map((s) => ({
        unitName: unitName(s.unit_id),
        teamName: teamName(s.team_id),
        soldierName: s.full_name,
        personalNumber: s.personal_number,
        status: statusName(statusBySoldier[s.id]),
      }));
  }, [soldiers, teamName, statusName, unitName, statusBySoldier]);

  const reportedCount = soldiers.filter((s) => statusBySoldier[s.id]).length;

  function exportXlsx() {
    const header = ['מסגרת', 'צוות', 'שם החייל', 'מספר אישי', 'סטטוס'];
    const body = rows.map((r) => [r.unitName, r.teamName, r.soldierName, r.personalNumber, r.status]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    ws['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'נוכחות');
    const unitLabel = isAdmin ? (unitName(unitFilter) || 'מסגרת') : (units.find((u) => u.id === raspUnitId)?.name ?? 'מסגרת');
    XLSX.writeFile(wb, `נוכחות_${unitLabel}_${date}.xlsx`);
  }

  if (!isAdmin && !isRaspar) return <Navigate to="/" replace />;
  if (isRaspar && !raspUnitId) {
    return <div className="card text-center text-slate-500">לא משוייכת לך מסגרת — פנה למנהל מערכת</div>;
  }

  return (
    <div className="space-y-5">
      <PageTitle title="דוחות נוכחות" subtitle="צפייה בנוכחות לפי יום וייצוא לאקסל" />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 ml-2">×</button>
        </div>
      )}

      <div className="card space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <label className="label">תאריך</label>
            <input type="date" className="input" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button type="button" onClick={exportXlsx} disabled={!effectiveUnitId || rows.length === 0}
              className="btn-secondary w-full disabled:opacity-40">ייצא לאקסל</button>
          </div>
        </div>

        {!effectiveUnitId ? (
          <p className="text-slate-400 text-center py-8 text-sm">יש לבחור מסגרת כדי לצפות בדוח</p>
        ) : loading ? (
          <p className="text-slate-400 text-center py-8 text-sm">טוען…</p>
        ) : (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="badge bg-emerald-50 text-emerald-700">{soldiers.length} חיילים</span>
              <span className="badge bg-sky-50 text-sky-700">דווחו {reportedCount}/{soldiers.length} · {new Date(date).toLocaleDateString('he-IL')}</span>
            </div>
            <div className="card p-0 overflow-x-auto max-w-full mx-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>צוות</th>
                    <th>שם החייל</th>
                    <th>מספר אישי</th>
                    <th className="text-center">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="text-slate-500">{r.teamName}</td>
                      <td className="font-medium whitespace-nowrap">{r.soldierName}</td>
                      <td className="text-slate-500">{r.personalNumber}</td>
                      <td className={`text-center font-bold ${r.status === 'לא דווח' ? 'text-slate-300' : 'text-emerald-700'}`}>
                        {r.status}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={4} className="text-center text-slate-400 py-8 text-sm">אין חיילים במסגרת זו</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
