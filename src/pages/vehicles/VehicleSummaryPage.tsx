import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { PageTitle } from '../bunker/shared';
import type { Unit } from '../../lib/database.types';
import DocViewerModal from '../../components/DocViewerModal';
import {
  listVehicleTypes,
  listVehiclesFull,
  updateVehicle,
  deleteVehicle,
  uploadVehicleDoc,
  VEHICLE_CATEGORIES,
  VEHICLE_DOC_LABELS,
  type VehicleType,
  type VehicleCategory,
  type VehicleFull,
  type VehicleDoc,
} from '../../lib/vehicles';

/**
 * רכב → סיכום רכבים.
 * Read-only overview of every vehicle, filterable by category (and unit for
 * admins); any missing detail is flagged red. Clicking a row opens an editor to
 * change the vehicle's details, manage its documents, or delete it.
 */
export default function VehicleSummaryPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isRaspar = profile?.role === 'raspar';
  const raspUnitId = profile?.unit_id ?? null;

  const [units, setUnits] = useState<Unit[]>([]);
  const [types, setTypes] = useState<VehicleType[]>([]);
  const [vehicles, setVehicles] = useState<VehicleFull[]>([]);
  const [category, setCategory] = useState<VehicleCategory | ''>('');
  const [viewUnit, setViewUnit] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ path: string; title: string } | null>(null);
  const [editing, setEditing] = useState<VehicleFull | null>(null);

  const unitName = useMemo(() => {
    const m = new Map(units.map((u) => [u.id, u.name]));
    return (id: string | null) => (id ? m.get(id) ?? '—' : '—');
  }, [units]);

  const listUnit = isAdmin ? (viewUnit || null) : raspUnitId;

  useEffect(() => {
    supabase.from('units').select('*').order('name').then(({ data }) => {
      if (data) setUnits(data as Unit[]);
    });
    listVehicleTypes().then(setTypes).catch((e) => setError((e as Error).message));
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
      <PageTitle title="סיכום רכבים" subtitle="כל פרטי הרכבים; מידע חסר מסומן באדום. לחיצה על שורה לעריכה" />

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
                <tr key={v.id} onClick={() => setEditing(v)}
                  className="cursor-pointer hover:bg-slate-50 transition">
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
                          <button type="button"
                            onClick={(e) => { e.stopPropagation(); openDoc(v, doc); }}
                            className="text-sky-600 hover:underline">צפה</button>
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

      {editing && (
        <EditVehicleModal
          vehicle={editing}
          types={types}
          units={units}
          isAdmin={isAdmin}
          onView={(doc) => openDoc(editing, doc)}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setVehicles((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
            setEditing(null);
          }}
          onDeleted={(id) => {
            setVehicles((prev) => prev.filter((x) => x.id !== id));
            setEditing(null);
          }}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  );
}

// ── Edit / delete modal ────────────────────────────────────────────────────────
function EditVehicleModal({
  vehicle, types, units, isAdmin, onView, onClose, onSaved, onDeleted, onError,
}: {
  vehicle: VehicleFull;
  types: VehicleType[];
  units: Unit[];
  isAdmin: boolean;
  onView: (doc: VehicleDoc) => void;
  onClose: () => void;
  onSaved: (v: VehicleFull) => void;
  onDeleted: (id: string) => void;
  onError: (msg: string) => void;
}) {
  const [plate, setPlate] = useState(vehicle.car_plate);
  const [unitId, setUnitId] = useState(vehicle.unit_id ?? '');
  const [category, setCategory] = useState<VehicleCategory>(
    (VEHICLE_CATEGORIES as string[]).includes(vehicle.category) ? (vehicle.category as VehicleCategory) : 'יר״מ',
  );
  const [typeId, setTypeId] = useState(vehicle.type_id);
  const [testDate, setTestDate] = useState(vehicle.next_test_date ?? '');
  const [testRange, setTestRange] = useState(vehicle.next_test_range != null ? String(vehicle.next_test_range) : '');
  const [mileage, setMileage] = useState(vehicle.mileage != null ? String(vehicle.mileage) : '');
  const [documents, setDocuments] = useState<VehicleDoc[]>(vehicle.documents);
  const [saving, setSaving] = useState(false);

  const modelsForCategory = types.filter((t) => t.type === category);
  const selectedModel = types.find((t) => t.id === typeId) ?? null;
  const license = selectedModel?.license ?? vehicle.license;
  const typeName = selectedModel?.name ?? vehicle.type_name;

  async function save() {
    if (!plate.trim()) { onError('נא להזין מספר רכב'); return; }
    if (!typeId) { onError('נא לבחור שם כלי'); return; }
    setSaving(true);
    try {
      const patch = {
        car_plate: plate.trim(),
        unit_id: unitId || null,
        type_id: typeId,
        next_test_date: testDate || null,
        next_test_range: testRange ? Number(testRange) : null,
        mileage: mileage ? Number(mileage) : null,
      };
      await updateVehicle(vehicle.id, patch);
      onSaved({ ...vehicle, ...patch, documents, type_name: typeName, category, license });
    } catch (e) {
      const code = (e as { code?: string }).code;
      onError(code === '23505' ? 'מספר רכב כבר קיים במערכת' : (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm('למחוק את הרכב?')) return;
    setSaving(true);
    try {
      await deleteVehicle(vehicle.id);
      onDeleted(vehicle.id);
    } catch (e) { onError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function upload(label: string, file: File) {
    try {
      const docs = await uploadVehicleDoc({ ...vehicle, documents }, label, file);
      setDocuments(docs);
    } catch (e) { onError((e as Error).message); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-bold">עריכת רכב</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">מספר רכב</label>
            <input className="input" value={plate} onChange={(e) => setPlate(e.target.value)} />
          </div>
          <div>
            <label className="label">מסגרת</label>
            <select className="input" value={unitId} disabled={!isAdmin} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">— ללא —</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">סוג</label>
            <select className="input" value={category}
              onChange={(e) => { setCategory(e.target.value as VehicleCategory); setTypeId(''); }}>
              {VEHICLE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">שם</label>
            <select className="input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">— בחר כלי —</option>
              {modelsForCategory.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">בדיקה הבאה (תאריך)</label>
            <input type="date" className="input" value={testDate} onChange={(e) => setTestDate(e.target.value)} />
          </div>
          <div>
            <label className="label">בדיקה הבאה (ק"מ)</label>
            <input type="number" className="input" value={testRange} onChange={(e) => setTestRange(e.target.value)} placeholder='ק"מ' />
          </div>
          <div>
            <label className="label">קילומטרג׳ נוכחי</label>
            <input type="number" className="input" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder='ק"מ' />
          </div>
        </div>

        {license && (
          <div className="mt-3">
            <label className="label">מסמכים</label>
            <div className="flex flex-wrap gap-2">
              {VEHICLE_DOC_LABELS.map((label) => {
                const doc = documents.find((d) => d.name === label);
                return (
                  <div key={label} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <span className="font-medium">{label}:</span>
                    {doc ? (
                      <button type="button" onClick={() => onView(doc)} className="text-sky-600 hover:underline">צפה</button>
                    ) : (
                      <span className="text-slate-400">אין</span>
                    )}
                    <label className="text-sky-600 hover:underline cursor-pointer">
                      {doc ? 'החלף' : 'העלה'}
                      <input type="file" accept="image/*,application/pdf" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(label, f); e.target.value = ''; }} />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mt-5">
          <button type="button" onClick={remove} disabled={saving}
            className="text-red-600 hover:text-red-800 text-sm disabled:opacity-50">מחק רכב</button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">ביטול</button>
            <button type="button" onClick={save} disabled={saving} className="btn-primary">
              {saving ? 'שומר…' : 'שמור'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
