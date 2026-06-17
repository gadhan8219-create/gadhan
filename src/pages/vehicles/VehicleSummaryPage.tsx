import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { PageTitle } from '../bunker/shared';
import type { Unit } from '../../lib/database.types';
import DocViewerModal from '../../components/DocViewerModal';
import {
  listVehiclesFull,
  VEHICLE_CATEGORIES,
  VEHICLE_DOC_LABELS,
  type VehicleCategory,
  type VehicleFull,
  type VehicleDoc,
} from '../../lib/vehicles';

/**
 * רכב → סיכום רכבים.
 * Read-only overview of every vehicle. Filter by category (and by unit for
 * admins). Any missing piece of information is highlighted red so gaps stand out.
 */
export default function VehicleSummaryPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isRaspar = profile?.role === 'raspar';
  const raspUnitId = profile?.unit_id ?? null;

  const [units, setUnits] = useState<Unit[]>([]);
  const [vehicles, setVehicles] = useState<VehicleFull[]>([]);
  const [category, setCategory] = useState<VehicleCategory | ''>('');
  const [viewUnit, setViewUnit] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ path: string; title: string } | null>(null);

  const unitName = useMemo(() => {
    const m = new Map(units.map((u) => [u.id, u.name]));
    return (id: string | null) => (id ? m.get(id) ?? '—' : '—');
  }, [units]);

  const listUnit = isAdmin ? (viewUnit || null) : raspUnitId;

  useEffect(() => {
    supabase.from('units').select('*').order('name').then(({ data }) => {
      if (data) setUnits(data as Unit[]);
    });
  }, []);

  async function reload() {
    setLoading(true);
    try { setVehicles(await listVehiclesFull(listUnit, category || undefined)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, viewUnit, raspUnitId]);

  if (!isAdmin && !isRaspar) return <Navigate to="/" replace />;
  if (isRaspar && !raspUnitId) {
    return <div className="card text-center text-slate-500">לא משוייכת לך מסגרת — פנה למנהל מערכת</div>;
  }

  // A cell is flagged when its value is missing.
  const missing = 'bg-red-50 text-red-700';
  const nextTestMissing = (v: VehicleFull) => v.next_test_date == null && v.next_test_range == null;
  const docMissing = (v: VehicleFull, label: string) =>
    v.license && !v.documents.some((d) => d.name === label);

  function openDoc(v: VehicleFull, doc: VehicleDoc) {
    setViewing({ path: doc.path ?? doc.url ?? '', title: `${doc.name} — ${v.car_plate}` });
  }

  return (
    <div className="space-y-5">
      <PageTitle title="סיכום רכבים" subtitle="כל פרטי הרכבים; מידע חסר מסומן באדום" />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 ml-2">×</button>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">סוג</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value as VehicleCategory)}>
              <option value="">כל הסוגים</option>
              {VEHICLE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {isAdmin && (
            <div>
              <label className="label">מסגרת</label>
              <select className="input" value={viewUnit} onChange={(e) => setViewUnit(e.target.value)}>
                <option value="">כל המסגרות</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="card text-center text-slate-400 py-12">טוען נתונים…</div>
      ) : vehicles.length === 0 ? (
        <div className="card text-center text-slate-400 py-12">אין רכבים להצגה</div>
      ) : (
        <div className="card p-0 overflow-x-auto max-w-full mx-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>מספר רכב</th>
                <th>שם</th>
                <th>סוג</th>
                <th>מסגרת</th>
                <th>בדיקה הבאה (תאריך)</th>
                <th>בדיקה הבאה (ק"מ)</th>
                <th>קילומטרג׳ נוכחי</th>
                {VEHICLE_DOC_LABELS.map((l) => <th key={l} className="text-center">{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id}>
                  <td className="font-medium">{v.car_plate}</td>
                  <td>{v.type_name}</td>
                  <td>{v.category}</td>
                  <td className={v.unit_id ? '' : missing}>{v.unit_id ? unitName(v.unit_id) : 'חסר'}</td>
                  <td className={nextTestMissing(v) ? missing : ''}>
                    {v.next_test_date ?? (nextTestMissing(v) ? 'חסר' : '—')}
                  </td>
                  <td className={nextTestMissing(v) ? missing : ''}>
                    {v.next_test_range ?? (nextTestMissing(v) ? 'חסר' : '—')}
                  </td>
                  <td className={v.mileage == null ? missing : ''}>
                    {v.mileage ?? 'חסר'}
                  </td>
                  {VEHICLE_DOC_LABELS.map((label) => {
                    if (!v.license) {
                      return <td key={label} className="text-center text-slate-300">לא נדרש</td>;
                    }
                    const doc = v.documents.find((d) => d.name === label);
                    return (
                      <td key={label} className={`text-center ${docMissing(v, label) ? missing : ''}`}>
                        {doc ? (
                          <button type="button" onClick={() => openDoc(v, doc)} className="text-sky-600 hover:underline">צפה</button>
                        ) : 'חסר'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewing && (
        <DocViewerModal
          bucket="vehicle-docs"
          pathOrUrl={viewing.path}
          title={viewing.title}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
