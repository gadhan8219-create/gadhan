import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { PageTitle } from '../bunker/shared';
import type { Unit } from '../../lib/database.types';
import { signedUrl } from '../../lib/storage';
import {
  listVehicles,
  createVehicle,
  deleteVehicle,
  updateVehicle,
  uploadVehicleDoc,
  typeIdByName,
  type Vehicle,
  type VehicleDoc,
} from '../../lib/vehicles';

const DOC_LABELS = ['טופס יר״מ', 'רשיון'];
type TestMode = 'date' | 'range';

/**
 * רכב → רכב יר״מ.
 * Register a plate, tie it to a unit, upload its יר״מ form + license, and set
 * the next-test reminder either by date or by kilometrage.
 */
export default function VehicleYrmPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isRaspar = profile?.role === 'raspar';
  const raspUnitId = profile?.unit_id ?? null;

  const [typeId, setTypeId] = useState<string | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [viewUnit, setViewUnit] = useState(''); // admin list filter ('' = all)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [plate, setPlate] = useState('');
  const [formUnit, setFormUnit] = useState('');
  const [testMode, setTestMode] = useState<TestMode>('date');
  const [testDate, setTestDate] = useState('');
  const [testRange, setTestRange] = useState('');
  const [saving, setSaving] = useState(false);

  const unitName = useMemo(() => {
    const m = new Map(units.map((u) => [u.id, u.name]));
    return (id: string | null) => (id ? m.get(id) ?? '—' : '—');
  }, [units]);

  useEffect(() => {
    Promise.all([typeIdByName('יר״מ'), supabase.from('units').select('*').order('name')])
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

  async function addVehicle() {
    const unit = isAdmin ? formUnit : raspUnitId;
    if (!plate.trim()) { setError('נא להזין מספר רכב'); return; }
    if (!unit) { setError('נא לבחור מסגרת'); return; }
    if (!typeId) return;
    setSaving(true);
    setError(null);
    try {
      await createVehicle({
        car_plate: plate,
        unit_id: unit,
        type_id: typeId,
        next_test_date: testMode === 'date' ? (testDate || null) : null,
        next_test_range: testMode === 'range' ? (testRange ? Number(testRange) : null) : null,
      });
      setPlate(''); setTestDate(''); setTestRange('');
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function onUpload(v: Vehicle, label: string, file: File) {
    setError(null);
    try {
      const docs = await uploadVehicleDoc(v, label, file);
      setVehicles((prev) => prev.map((x) => (x.id === v.id ? { ...x, documents: docs } : x)));
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

  async function openDoc(doc: VehicleDoc) {
    setError(null);
    try {
      const url = await signedUrl('vehicle-docs', doc.path ?? doc.url ?? '');
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveTest(v: Vehicle, patch: Partial<Vehicle>) {
    try {
      await updateVehicle(v.id, patch);
      setVehicles((prev) => prev.map((x) => (x.id === v.id ? { ...x, ...patch } : x)));
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
      <PageTitle title="רכב יר״מ" subtitle="מספר רכב, שיוך למסגרת, טפסים ובדיקה הבאה" />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 ml-2">×</button>
        </div>
      )}

      {/* Add form */}
      <div className="card space-y-4">
        <h3 className="font-semibold">הוספת רכב</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">מספר רכב</label>
            <input className="input" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="12-345-67" />
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
        </div>

        <div>
          <label className="label">בדיקה הבאה לפי</label>
          <div className="flex gap-4 mb-2 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={testMode === 'date'} onChange={() => setTestMode('date')} /> תאריך
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={testMode === 'range'} onChange={() => setTestMode('range')} /> קילומטרז׳
            </label>
          </div>
          {testMode === 'date' ? (
            <input type="date" className="input" value={testDate} onChange={(e) => setTestDate(e.target.value)} />
          ) : (
            <input type="number" className="input" value={testRange} onChange={(e) => setTestRange(e.target.value)} placeholder='ק"מ לבדיקה הבאה' />
          )}
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
      <div className="space-y-3">
        {loading ? (
          <div className="card text-center text-slate-400 text-sm py-8">טוען…</div>
        ) : vehicles.length === 0 ? (
          <div className="card text-center text-slate-400 text-sm py-8">אין רכבים להצגה</div>
        ) : (
          vehicles.map((v) => (
            <div key={v.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-lg font-bold">{v.car_plate}</div>
                  <div className="text-sm text-slate-500">{unitName(v.unit_id)}</div>
                </div>
                <button onClick={() => onRemove(v.id)} className="text-red-500 hover:text-red-700 text-sm">מחק</button>
              </div>

              {/* Next test */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">בדיקה הבאה (תאריך)</label>
                  <input
                    type="date"
                    className="input"
                    value={v.next_test_date ?? ''}
                    onChange={(e) => saveTest(v, { next_test_date: e.target.value || null })}
                  />
                </div>
                <div>
                  <label className="label">בדיקה הבאה (ק"מ)</label>
                  <input
                    type="number"
                    className="input"
                    defaultValue={v.next_test_range ?? ''}
                    onBlur={(e) => saveTest(v, { next_test_range: e.target.value ? Number(e.target.value) : null })}
                    placeholder='ק"מ'
                  />
                </div>
              </div>

              {/* Documents */}
              <div>
                <label className="label">מסמכים</label>
                <div className="flex flex-wrap gap-2">
                  {DOC_LABELS.map((label) => {
                    const doc = v.documents.find((d) => d.name === label);
                    return (
                      <div key={label} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                        <span className="font-medium">{label}:</span>
                        {doc ? (
                          <button type="button" onClick={() => openDoc(doc)} className="text-sky-600 hover:underline">צפה</button>
                        ) : (
                          <span className="text-slate-400">אין</span>
                        )}
                        <label className="text-sky-600 hover:underline cursor-pointer">
                          {doc ? 'החלף' : 'העלה'}
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(v, label, f); e.target.value = ''; }}
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
