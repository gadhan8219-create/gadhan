import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { PageTitle } from '../bunker/shared';
import type { Unit } from '../../lib/database.types';
import DocViewerModal from '../../components/DocViewerModal';
import {
  listVehicleTypes,
  createVehicleType,
  deleteVehicleType,
  listVehiclesFull,
  createVehicle,
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

type TestMode = 'date' | 'range';

/**
 * רכב → ניהול כלי רכב.
 * One screen to (a) maintain the model catalog (vehicle_types: name + category +
 * whether documents are required) and (b) register full vehicles. Vehicles whose
 * model requires documents get the form + license upload, like the old יר״מ flow.
 */
export default function VehicleManagePage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isRaspar = profile?.role === 'raspar';
  const raspUnitId = profile?.unit_id ?? null;

  const [units, setUnits] = useState<Unit[]>([]);
  const [types, setTypes] = useState<VehicleType[]>([]);
  const [vehicles, setVehicles] = useState<VehicleFull[]>([]);
  const [viewUnit, setViewUnit] = useState(''); // admin list filter ('' = all)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ path: string; title: string } | null>(null);

  // ── Catalog form (admin) ─────────────────────────────────────────────────
  const [tName, setTName] = useState('');
  const [tType, setTType] = useState<VehicleCategory>('יר״מ');
  const [tLicense, setTLicense] = useState(false);
  const [savingType, setSavingType] = useState(false);

  // ── Add-vehicle form ─────────────────────────────────────────────────────
  const [plate, setPlate] = useState('');
  const [formUnit, setFormUnit] = useState('');
  const [vCategory, setVCategory] = useState<VehicleCategory | ''>('');
  const [vTypeId, setVTypeId] = useState('');
  const [testMode, setTestMode] = useState<TestMode>('date');
  const [testDate, setTestDate] = useState('');
  const [testRange, setTestRange] = useState('');
  const [mileage, setMileage] = useState('');
  const [formFiles, setFormFiles] = useState<Record<string, File | null>>({});
  const [savingVehicle, setSavingVehicle] = useState(false);

  const unitName = useMemo(() => {
    const m = new Map(units.map((u) => [u.id, u.name]));
    return (id: string | null) => (id ? m.get(id) ?? '—' : '—');
  }, [units]);

  const listUnit = isAdmin ? (viewUnit || null) : raspUnitId;
  const selectedType = types.find((t) => t.id === vTypeId) ?? null;
  // Models available for the chosen category.
  const modelsForCategory = vCategory ? types.filter((t) => t.type === vCategory) : [];

  useEffect(() => {
    supabase.from('units').select('*').order('name').then(({ data }) => {
      if (data) setUnits(data as Unit[]);
    });
  }, []);

  async function reloadTypes() {
    try { setTypes(await listVehicleTypes()); }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { reloadTypes(); }, []);

  async function reloadVehicles() {
    setLoading(true);
    try { setVehicles(await listVehiclesFull(listUnit)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    reloadVehicles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewUnit, raspUnitId]);

  // ── Catalog actions ────────────────────────────────────────────────────────
  async function addType() {
    if (!tName.trim()) { setError('נא להזין שם כלי'); return; }
    setSavingType(true); setError(null);
    try {
      await createVehicleType({ name: tName, type: tType, license: tLicense });
      setTName(''); setTLicense(false);
      await reloadTypes();
    } catch (e) { setError((e as Error).message); }
    finally { setSavingType(false); }
  }

  async function removeType(id: string) {
    if (!confirm('למחוק את הכלי מהקטלוג?')) return;
    setError(null);
    try { await deleteVehicleType(id); await reloadTypes(); }
    catch (e) { setError((e as Error).message); }
  }

  // ── Add-vehicle actions ──────────────────────────────────────────────────
  function resetVehicleForm() {
    setPlate(''); setVCategory(''); setVTypeId('');
    setTestDate(''); setTestRange(''); setMileage(''); setFormFiles({});
  }

  async function addVehicle() {
    const unit = isAdmin ? formUnit : raspUnitId;
    if (!plate.trim()) { setError('נא להזין מספר רכב'); return; }
    if (!unit) { setError('נא לבחור מסגרת'); return; }
    if (!vCategory) { setError('נא לבחור סוג'); return; }
    if (!vTypeId) { setError('נא לבחור שם כלי'); return; }
    setSavingVehicle(true); setError(null);
    try {
      const created = await createVehicle({
        car_plate: plate,
        unit_id: unit,
        type_id: vTypeId,
        next_test_date: testMode === 'date' ? (testDate || null) : null,
        next_test_range: testMode === 'range' ? (testRange ? Number(testRange) : null) : null,
        mileage: mileage ? Number(mileage) : null,
      });
      // If the model requires documents, upload any files chosen in the form.
      if (selectedType?.license) {
        for (const label of VEHICLE_DOC_LABELS) {
          const f = formFiles[label];
          if (f) await uploadVehicleDoc(created, label, f);
        }
      }
      resetVehicleForm();
      await reloadVehicles();
    } catch (e) { setError((e as Error).message); }
    finally { setSavingVehicle(false); }
  }

  // ── Vehicle-row actions ──────────────────────────────────────────────────
  async function saveRow(v: VehicleFull, patch: Partial<VehicleFull>) {
    try {
      await updateVehicle(v.id, patch);
      setVehicles((prev) => prev.map((x) => (x.id === v.id ? { ...x, ...patch } : x)));
    } catch (e) { setError((e as Error).message); }
  }

  async function onUpload(v: VehicleFull, label: string, file: File) {
    setError(null);
    try {
      const docs = await uploadVehicleDoc(v, label, file);
      setVehicles((prev) => prev.map((x) => (x.id === v.id ? { ...x, documents: docs } : x)));
    } catch (e) { setError((e as Error).message); }
  }

  async function onRemove(id: string) {
    if (!confirm('למחוק את הרכב?')) return;
    try {
      await deleteVehicle(id);
      setVehicles((prev) => prev.filter((x) => x.id !== id));
    } catch (e) { setError((e as Error).message); }
  }

  function openDoc(v: VehicleFull, doc: VehicleDoc) {
    setError(null);
    setViewing({ path: doc.path ?? doc.url ?? '', title: `${doc.name} — ${v.car_plate}` });
  }

  if (!isAdmin && !isRaspar) return <Navigate to="/" replace />;
  if (isRaspar && !raspUnitId) {
    return <div className="card text-center text-slate-500">לא משוייכת לך מסגרת — פנה למנהל מערכת</div>;
  }

  return (
    <div className="space-y-5">
      <PageTitle title="ניהול כלי רכב" subtitle="קטלוג כלים (שם/סוג/מסמכים) והוספת רכבים" />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 ml-2">×</button>
        </div>
      )}

      {/* ── Catalog (admin only) ── */}
      {isAdmin && (
        <div className="card space-y-4">
          <h3 className="font-semibold">קטלוג כלים</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">סוג</label>
              <select className="input" value={tType} onChange={(e) => setTType(e.target.value as VehicleCategory)}>
                {VEHICLE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">שם הכלי</label>
              <input className="input" value={tName} onChange={(e) => setTName(e.target.value)} placeholder="משאית קירור / האמר…" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer select-none mb-2.5">
                <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={tLicense} onChange={(e) => setTLicense(e.target.checked)} />
                <span className="text-sm text-slate-600">נדרשים מסמכים</span>
              </label>
            </div>
          </div>
          <button type="button" onClick={addType} disabled={savingType} className="btn-primary">
            {savingType ? 'שומר…' : '+ הוסף כלי לקטלוג'}
          </button>

          {types.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {types.map((t) => (
                <span key={t.id} className="badge bg-slate-100 text-slate-700 flex items-center gap-1.5">
                  <span className="text-slate-400">{t.type}</span>
                  <span className="font-medium">{t.name}</span>
                  {t.license && <span className="text-sky-600">· מסמכים</span>}
                  <button onClick={() => removeType(t.id)} className="text-red-400 hover:text-red-600 mr-1">×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Add vehicle ── */}
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
          <div>
            <label className="label">סוג</label>
            <select className="input" value={vCategory}
              onChange={(e) => { setVCategory(e.target.value as VehicleCategory); setVTypeId(''); }}>
              <option value="">— בחר סוג —</option>
              {VEHICLE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">שם</label>
            <select className="input" value={vTypeId} disabled={!vCategory}
              onChange={(e) => setVTypeId(e.target.value)}>
              <option value="">{vCategory ? '— בחר כלי —' : 'בחר סוג קודם'}</option>
              {modelsForCategory.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <div>
            <label className="label">קילומטרג׳ נוכחי</label>
            <input type="number" className="input" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder='ק"מ' />
          </div>
        </div>

        {/* Documents upload — only when the chosen model requires them */}
        {selectedType?.license && (
          <div>
            <label className="label">מסמכים</label>
            <div className="flex flex-wrap gap-2">
              {VEHICLE_DOC_LABELS.map((label) => (
                <div key={label} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className="font-medium">{label}:</span>
                  <label className="text-sky-600 hover:underline cursor-pointer">
                    {formFiles[label] ? formFiles[label]!.name : 'בחר קובץ'}
                    <input type="file" accept="image/*,application/pdf" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0] ?? null; setFormFiles((p) => ({ ...p, [label]: f })); }} />
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        <button type="button" onClick={addVehicle} disabled={savingVehicle} className="btn-primary">
          {savingVehicle ? 'שומר…' : '+ הוסף רכב'}
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

      {/* Vehicle list */}
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
                  <div className="text-sm text-slate-500">
                    {v.type_name} · {v.category} · {unitName(v.unit_id)}
                  </div>
                </div>
                <button onClick={() => onRemove(v.id)} className="text-red-500 hover:text-red-700 text-sm">מחק</button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">בדיקה הבאה (תאריך)</label>
                  <input type="date" className="input" value={v.next_test_date ?? ''}
                    onChange={(e) => saveRow(v, { next_test_date: e.target.value || null })} />
                </div>
                <div>
                  <label className="label">בדיקה הבאה (ק"מ)</label>
                  <input type="number" className="input" defaultValue={v.next_test_range ?? ''}
                    onBlur={(e) => saveRow(v, { next_test_range: e.target.value ? Number(e.target.value) : null })} placeholder='ק"מ' />
                </div>
                <div>
                  <label className="label">קילומטרג׳ נוכחי</label>
                  <input type="number" className="input" defaultValue={v.mileage ?? ''}
                    onBlur={(e) => saveRow(v, { mileage: e.target.value ? Number(e.target.value) : null })} placeholder='ק"מ' />
                </div>
              </div>

              {/* Documents — only for models that require them */}
              {v.license && (
                <div>
                  <label className="label">מסמכים</label>
                  <div className="flex flex-wrap gap-2">
                    {VEHICLE_DOC_LABELS.map((label) => {
                      const doc = v.documents.find((d) => d.name === label);
                      return (
                        <div key={label} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                          <span className="font-medium">{label}:</span>
                          {doc ? (
                            <button type="button" onClick={() => openDoc(v, doc)} className="text-sky-600 hover:underline">צפה</button>
                          ) : (
                            <span className="text-slate-400">אין</span>
                          )}
                          <label className="text-sky-600 hover:underline cursor-pointer">
                            {doc ? 'החלף' : 'העלה'}
                            <input type="file" accept="image/*,application/pdf" className="hidden"
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(v, label, f); e.target.value = ''; }} />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

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
