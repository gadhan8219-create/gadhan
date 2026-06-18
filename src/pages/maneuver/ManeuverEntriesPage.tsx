import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { PageTitle } from '../bunker/shared';
import type { Soldier, Unit } from '../../lib/database.types';
import {
  addEntries,
  listEntries,
  deleteEntry,
  deleteEntriesForUnit,
  tomorrowISO,
  type ManeuverEntry,
} from '../../lib/maneuver';

// ── Autocomplete single-name picker ─────────────────────────────────────────────
function SoldierPicker({
  soldiers, exclude, onPick, placeholder,
}: {
  soldiers: Soldier[];
  exclude: Set<string>;
  onPick: (id: string) => void;
  placeholder: string;
}) {
  const [q, setQ] = useState('');
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setShow(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const matches = q.trim()
    ? soldiers
        .filter((s) => !exclude.has(s.id) && (s.full_name.includes(q) || s.personal_number.includes(q)))
        .slice(0, 8)
    : [];

  return (
    <div ref={ref} className="relative">
      <input className="input" value={q} placeholder={placeholder} autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setShow(true); }}
        onFocus={() => setShow(true)} />
      {show && matches.length > 0 && (
        <ul className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-auto">
          {matches.map((s) => (
            <li key={s.id} onMouseDown={() => { onPick(s.id); setQ(''); setShow(false); }}
              className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 text-sm">
              <span className="font-medium">{s.full_name}</span>
              <span className="text-xs text-slate-500">{s.personal_number}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * תמרון → כניסות/יציאות.
 * Build entering/exiting name lists (autocomplete over the unit's soldiers),
 * submit them for TOMORROW, then edit the saved lists (add/remove) and clear them
 * with בוצע.
 */
export default function ManeuverEntriesPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isRaspar = profile?.role === 'raspar';
  const raspUnitId = profile?.unit_id ?? null;

  const [units, setUnits] = useState<Unit[]>([]);
  const [soldiers, setSoldiers] = useState<Soldier[]>([]);
  const [unitId, setUnitId] = useState('');
  const [enterSel, setEnterSel] = useState<string[]>([]);
  const [exitSel, setExitSel] = useState<string[]>([]);
  const [entries, setEntries] = useState<ManeuverEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effectiveUnit = isAdmin ? unitId : (raspUnitId ?? '');

  const soldierById = useMemo(() => new Map(soldiers.map((s) => [s.id, s])), [soldiers]);
  const unitSoldiers = useMemo(
    () => soldiers.filter((s) => s.unit_id === effectiveUnit),
    [soldiers, effectiveUnit],
  );

  useEffect(() => {
    Promise.all([
      supabase.from('units').select('*').order('name'),
      supabase.from('soldiers').select('*').order('full_name'),
    ]).then(([u, s]) => {
      if (u.data) setUnits(u.data as Unit[]);
      if (s.data) setSoldiers(s.data as Soldier[]);
    });
  }, []);

  async function reloadEntries() {
    if (!effectiveUnit) { setEntries([]); return; }
    try { setEntries(await listEntries(effectiveUnit)); }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => {
    setEnterSel([]); setExitSel([]);
    reloadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUnit]);

  const dbEntries = entries.filter((e) => e.is_entry);
  const dbExits = entries.filter((e) => !e.is_entry);

  async function submitLists() {
    if (!effectiveUnit) { setError('נא לבחור מסגרת'); return; }
    if (enterSel.length === 0 && exitSel.length === 0) { setError('הוסף לפחות שם אחד'); return; }
    setBusy(true); setError(null); setSuccess(null);
    try {
      const date = tomorrowISO();
      await addEntries(effectiveUnit, true, enterSel, date);
      await addEntries(effectiveUnit, false, exitSel, date);
      setSuccess(`הרשימה הוזנה לתאריך ${new Date(date + 'T00:00:00').toLocaleDateString('he-IL')}`);
      setEnterSel([]); setExitSel([]);
      await reloadEntries();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function addOne(isEntry: boolean, soldierId: string) {
    if (!effectiveUnit) return;
    setError(null);
    try { await addEntries(effectiveUnit, isEntry, [soldierId], tomorrowISO()); await reloadEntries(); }
    catch (e) { setError((e as Error).message); }
  }

  async function removeOne(id: string) {
    setError(null);
    try { await deleteEntry(id); await reloadEntries(); }
    catch (e) { setError((e as Error).message); }
  }

  async function done() {
    if (!effectiveUnit) return;
    if (!confirm('למחוק את כל רשימות הכניסה/יציאה של המסגרת?')) return;
    setBusy(true); setError(null);
    try { await deleteEntriesForUnit(effectiveUnit); await reloadEntries(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  if (!isAdmin && !isRaspar) return <Navigate to="/" replace />;
  if (isRaspar && !raspUnitId) {
    return <div className="card text-center text-slate-500">לא משוייכת לך מסגרת — פנה למנהל מערכת</div>;
  }

  // Chip list for the top builder boxes.
  function Chips({ ids, onRemove }: { ids: string[]; onRemove: (id: string) => void }) {
    if (ids.length === 0) return <p className="text-xs text-slate-400 mt-1">אין שמות ברשימה</p>;
    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {ids.map((id) => {
          const s = soldierById.get(id);
          return (
            <span key={id} className="badge bg-slate-100 text-slate-700 flex items-center gap-1">
              {s?.full_name ?? '—'} <span className="text-slate-400">{s?.personal_number}</span>
              <button onClick={() => onRemove(id)} className="text-red-400 hover:text-red-600 mr-1">×</button>
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageTitle title="כניסות / יציאות" subtitle="רשימות נכנסים ויוצאים למחר" />

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

      {effectiveUnit && (
        <>
          {/* Builders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card">
              <label className="label">נכנסים</label>
              <SoldierPicker soldiers={unitSoldiers} exclude={new Set(enterSel)} placeholder="הקלד שם או מ.א…"
                onPick={(id) => setEnterSel((p) => [...p, id])} />
              <Chips ids={enterSel} onRemove={(id) => setEnterSel((p) => p.filter((x) => x !== id))} />
            </div>
            <div className="card">
              <label className="label">יוצאים</label>
              <SoldierPicker soldiers={unitSoldiers} exclude={new Set(exitSel)} placeholder="הקלד שם או מ.א…"
                onPick={(id) => setExitSel((p) => [...p, id])} />
              <Chips ids={exitSel} onRemove={(id) => setExitSel((p) => p.filter((x) => x !== id))} />
            </div>
          </div>
          <button type="button" onClick={submitLists} disabled={busy} className="btn-primary w-full">
            {busy ? '…' : 'הזן רשימה (למחר)'}
          </button>

          {/* Saved lists — editable */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SavedList title="נכנסים (שמור)" rows={dbEntries} soldiers={unitSoldiers}
              onAdd={(id) => addOne(true, id)} onRemove={removeOne} />
            <SavedList title="יוצאים (שמור)" rows={dbExits} soldiers={unitSoldiers}
              onAdd={(id) => addOne(false, id)} onRemove={removeOne} />
          </div>

          {entries.length > 0 && (
            <button type="button" onClick={done} disabled={busy} className="btn-danger w-full">
              בוצע — מחיקת הרשימות
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Saved (DB) list with inline add/remove ──────────────────────────────────────
function SavedList({
  title, rows, soldiers, onAdd, onRemove,
}: {
  title: string;
  rows: ManeuverEntry[];
  soldiers: Soldier[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const present = new Set(rows.map((r) => r.soldier_id));
  return (
    <div className="card">
      <label className="label">{title}</label>
      <SoldierPicker soldiers={soldiers} exclude={present} placeholder="הוסף שם…" onPick={onAdd} />
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 mt-2">הרשימה ריקה</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between border-b border-slate-100 py-1">
              <span>{r.soldierName} <span className="text-xs text-slate-400">{r.soldierPN}</span></span>
              <button onClick={() => onRemove(r.id)} className="text-red-400 hover:text-red-600">×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
