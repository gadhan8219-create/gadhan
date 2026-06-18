import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { PageTitle } from '../bunker/shared';
import type { Team, Unit } from '../../lib/database.types';
import {
  listCategories,
  createCategory,
  addRequirements,
  splitRequirements,
  type ManeuverCategory,
} from '../../lib/maneuver';

/**
 * תמרון → דרישות תמרון.
 * Build an organized, category-classified requirements list. Admin (or raspar for
 * their own unit) picks מסגרת + optional צוות + קטגוריה, types the requirements
 * (one per line / comma-separated) and adds them — one row per requirement.
 */
export default function ManeuverRequirementsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isRaspar = profile?.role === 'raspar';
  const raspUnitId = profile?.unit_id ?? null;

  const [units, setUnits] = useState<Unit[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [categories, setCategories] = useState<ManeuverCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New category
  const [newCat, setNewCat] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  // Requirement form
  const [unitId, setUnitId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const effectiveUnit = isAdmin ? unitId : (raspUnitId ?? '');
  const teamsForUnit = useMemo(() => teams.filter((t) => t.unit_id === effectiveUnit), [teams, effectiveUnit]);

  useEffect(() => {
    Promise.all([
      supabase.from('units').select('*').order('name'),
      supabase.from('teams').select('*').order('name'),
    ]).then(([u, t]) => {
      if (u.data) setUnits(u.data as Unit[]);
      if (t.data) setTeams(t.data as Team[]);
    });
    reloadCategories();
  }, []);

  async function reloadCategories() {
    try { setCategories(await listCategories()); }
    catch (e) { setError((e as Error).message); }
  }

  async function addCat() {
    if (!newCat.trim()) { setError('נא להזין שם קטגוריה'); return; }
    setSavingCat(true); setError(null);
    try {
      await createCategory(newCat);
      setNewCat('');
      await reloadCategories();
    } catch (e) { setError((e as Error).message); }
    finally { setSavingCat(false); }
  }

  async function add() {
    const unit = effectiveUnit;
    if (!unit) { setError('נא לבחור מסגרת'); return; }
    if (!categoryId) { setError('נא לבחור קטגוריה'); return; }
    const reqs = splitRequirements(text);
    if (reqs.length === 0) { setError('נא להזין דרישות'); return; }
    setSaving(true); setError(null); setSuccess(null);
    try {
      await addRequirements(unit, teamId || null, categoryId, reqs);
      setSuccess(`${reqs.length} דרישות נוספו`);
      setText('');
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  if (!isAdmin && !isRaspar) return <Navigate to="/" replace />;
  if (isRaspar && !raspUnitId) {
    return <div className="card text-center text-slate-500">לא משוייכת לך מסגרת — פנה למנהל מערכת</div>;
  }

  return (
    <div className="space-y-5">
      <PageTitle title="דרישות תמרון" subtitle="רשימת דרישות מסווגת לפי קטגוריה" />

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

      {/* Add category */}
      <div className="card">
        <label className="label">הוספת קטגוריה</label>
        <div className="flex gap-2">
          <input className="input" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="שם קטגוריה חדשה…" />
          <button type="button" onClick={addCat} disabled={savingCat} className="btn-secondary whitespace-nowrap">
            {savingCat ? '…' : '+ הוסף'}
          </button>
        </div>
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {categories.map((c) => (
              <span key={c.id} className="badge bg-slate-100 text-slate-700">{c.name}</span>
            ))}
          </div>
        )}
      </div>

      {/* Requirement form */}
      <div className="card space-y-4">
        <h3 className="font-semibold">הוספת דרישות</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">מסגרת</label>
            {isAdmin ? (
              <select className="input" value={unitId} onChange={(e) => { setUnitId(e.target.value); setTeamId(''); }}>
                <option value="">— בחר מסגרת —</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            ) : (
              <input className="input bg-slate-50" value={units.find((u) => u.id === raspUnitId)?.name ?? '—'} disabled />
            )}
          </div>
          <div>
            <label className="label">צוות (לא חובה)</label>
            <select className="input" value={teamId} disabled={!effectiveUnit || teamsForUnit.length === 0}
              onChange={(e) => setTeamId(e.target.value)}>
              <option value="">— ללא —</option>
              {teamsForUnit.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">קטגוריה</label>
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— בחר קטגוריה —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">דרישות (כל דרישה בשורה נפרדת או מופרדת בפסיק)</label>
          <textarea className="input min-h-[120px]" value={text} onChange={(e) => setText(e.target.value)}
            placeholder={'לדוגמה:\nמים\nמנות קרב\nסוללות'} />
        </div>
        <button type="button" onClick={add} disabled={saving} className="btn-primary">
          {saving ? 'שומר…' : 'הוספה'}
        </button>
      </div>
    </div>
  );
}
