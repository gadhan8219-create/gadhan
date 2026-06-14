import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { PageTitle } from '../bunker/shared';
import type { Unit } from '../../lib/database.types';
import {
  listVehicles,
  createVehicle,
  deleteVehicle,
  updateVehicle,
  typeIdByName,
  daysUntil,
  TEST_ALERT_DAYS,
  type Vehicle,
} from '../../lib/vehicles';

/**
 * רכב → רכבים צבאיים.
 * Register a vehicle by its צ׳ (serial), tie it to a unit, and track the next
 * test date manually. A prominent alert always shows vehicles whose test is
 * fewer than TEST_ALERT_DAYS days away (or overdue).
 */
export default function VehicleMilitaryPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isRaspar = profile?.role === 'raspar';
  const raspUnitId = profile?.unit_id ?? null;

  const [typeId, setTypeId] = useState<string | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [viewUnit, setViewUnit] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [tzaad, setTzaad] = useState('');
  const [formUnit, setFormUnit] = useState('');
  const [testDate, setTestDate] = useState('');
  const [saving, setSaving] = useState(false);

  const unitName = useMemo(() => {
    const m = new Map(units.map((u) => [u.id, u.name]));
    return (id: string | null) => (id ? m.get(id) ?? '—' : '—');
  }, [units]);

  useEffect(() => {
    Promise.all([typeIdByName('צבאי'), supabase.from('units').select('*').order('name')])
      .then(([tid, u]) => {
        setTypeId(tid);
        if (u.data) setUnits(u.data as Unit[]);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const listUnit = isAdmin ? (viewUnit || null) : raspUnitId;

  async function reload() {
    if (!typeId) return;
    setLoading(true);
    try {
      setVehicles(await listVehicles(typeId, listUnit));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeId, viewUnit, raspUnitId]);

  const dueSoon = useMemo(
    () => vehicles.filter((v) => v.next_test_date && daysUntil(v.next_test_date) < TEST_ALERT_DAYS)
      .sort((a, b) => daysUntil(a.next_test_date!) - daysUntil(b.next_test_date!)),
    [vehicles],
  );

  async function addVehicle() {
    const unit = isAdmin ? formUnit : raspUnitId;
    if (!tzaad.trim()) { setError('נא להזין צ׳ של הרכב'); return; }
    if (!unit) { setError('נא לבחור מסגרת'); return; }
    if (!typeId) return;
    setSaving(true);
    setError(null);
    try {
      await createVehicle({ car_plate: tzaad, unit_id: unit, type_id: typeId, next_test_date: testDate || null });
      setTzaad(''); setTestDate('');
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveDate(v: Vehicle, date: string | null) {
    try {
      await updateVehicle(v.id, { next_test_date: date });
      setVehicles((prev) => prev.map((x) => (x.id === v.id ? { ...x, next_test_date: date } : x)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onRemove(id: string) {
    if (!confirm('למחוק את הרכב?')) return;
    try {
      await deleteVehicle(id);
      setVehicles((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!isAdmin && !isRaspar) return <Navigate to="/" replace />;
  if (isRaspar && !raspUnitId) {
    return <div className="card text-center text-slate-500">לא משוייכת לך מסגרת — פנה למנהל מערכת</div>;
  }

  return (
    <div className="space-y-5">
      <PageTitle title="רכבים צבאיים" subtitle="צ׳ הרכב, שיוך למסגרת ותאריך הבדיקה הבא" />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 ml-2">×</button>
        </div>
      )}

      {/* Always-on alert for tests due within TEST_ALERT_DAYS */}
      {dueSoon.length > 0 && (
        <div className="rounded-xl bg-red-50 border-2 border-red-300 p-4">
          <div className="font-bold text-red-700 mb-2">רכבים נדרשים לבדיקה ({dueSoon.length})</div>
          <div className="space-y-1.5">
            {dueSoon.map((v) => {
              const d = daysUntil(v.next_test_date!);
              return (
                <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{v.car_plate} · {unitName(v.unit_id)}</span>
                  <span className={`badge ${d < 0 ? 'bg-red-200 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                    {d < 0 ? `באיחור ${-d} ימים` : d === 0 ? 'היום' : `בעוד ${d} ימים`} · {new Date(v.next_test_date! + 'T00:00:00').toLocaleDateString('he-IL')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add form */}
      <div className="card space-y-4">
        <h3 className="font-semibold">הוספת רכב</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">צ׳ הרכב</label>
            <input className="input" value={tzaad} onChange={(e) => setTzaad(e.target.value)} placeholder="צ׳ הרכב" />
          </div>
          <div>
            <label className="label">מסגרת</label>
            {isAdmin ? (
              <select className="input" value={formUnit} onChange={(e) => setFormUnit(e.target.value)}>
                <option value="">— בחר מסגרת —</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            ) : (
              <input className="input bg-slate-50" value={unitName(raspUnitId)} disabled />
            )}
          </div>
          <div>
            <label className="label">תאריך בדיקה הבא</label>
            <input type="date" className="input" value={testDate} onChange={(e) => setTestDate(e.target.value)} />
          </div>
        </div>
        <button type="button" onClick={addVehicle} disabled={saving} className="btn-primary">
          {saving ? 'שומר…' : '+ הוסף רכב'}
        </button>
      </div>

      {/* Admin list filter */}
      {isAdmin && (
        <div className="card">
          <label className="label">סינון לפי מסגרת</label>
          <select className="input" value={viewUnit} onChange={(e) => setViewUnit(e.target.value)}>
            <option value="">כל המסגרות</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      )}

      {/* List */}
      <div className="card p-0 overflow-x-auto max-w-full mx-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>צ׳ הרכב</th>
              <th>מסגרת</th>
              <th>תאריך בדיקה הבא</th>
              <th className="text-center">סטטוס</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => {
              const d = v.next_test_date ? daysUntil(v.next_test_date) : null;
              const due = d !== null && d < TEST_ALERT_DAYS;
              return (
                <tr key={v.id}>
                  <td className="font-medium whitespace-nowrap">{v.car_plate}</td>
                  <td className="text-slate-500">{unitName(v.unit_id)}</td>
                  <td>
                    <input
                      type="date"
                      className="input py-1"
                      value={v.next_test_date ?? ''}
                      onChange={(e) => saveDate(v, e.target.value || null)}
                    />
                  </td>
                  <td className="text-center">
                    {d === null ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <span className={`badge ${due ? (d < 0 ? 'bg-red-200 text-red-800' : 'bg-amber-100 text-amber-800') : 'bg-emerald-50 text-emerald-700'}`}>
                        {d < 0 ? `באיחור ${-d}י׳` : d === 0 ? 'היום' : `בעוד ${d}י׳`}
                      </span>
                    )}
                  </td>
                  <td className="text-center">
                    <button onClick={() => onRemove(v.id)} className="text-red-500 hover:text-red-700 text-sm">מחק</button>
                  </td>
                </tr>
              );
            })}
            {vehicles.length === 0 && !loading && (
              <tr><td colSpan={5} className="text-center text-slate-400 py-8 text-sm">אין רכבים להצגה</td></tr>
            )}
            {loading && (
              <tr><td colSpan={5} className="text-center text-slate-400 py-8 text-sm">טוען…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
