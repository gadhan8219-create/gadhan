import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { PageTitle } from '../bunker/shared';
import type { Soldier, Team, Unit } from '../../lib/database.types';
import {
  listItems, listBags, setBags, listSoldierBags, setSoldierBag, deleteGenericBag,
  type StorageItem, type Bag, type SoldierBag,
} from '../../lib/imach';

/**
 * ניהול ימ״ח → תיקי לוחם.
 * Admin sets the battalion-wide standard bag (bags). Everyone picks a מסגרת,
 * browses soldiers by team (collapsible), and edits each soldier's bag — or a
 * unit-level "תיק גנרי" — against the standard items (or all items if no standard).
 */
export default function ImachBagsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isRaspar = profile?.role === 'raspar';
  const raspUnitId = profile?.unit_id ?? null;

  const [units, setUnits] = useState<Unit[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [items, setItems] = useState<StorageItem[]>([]);
  const [bags, setBagsState] = useState<Bag[]>([]);
  const [soldiers, setSoldiers] = useState<Soldier[]>([]);
  const [soldierBags, setSoldierBags] = useState<SoldierBag[]>([]);

  const [unitId, setUnitId] = useState('');
  const [openTeams, setOpenTeams] = useState<Set<string>>(new Set());
  const [stdQty, setStdQty] = useState<Record<string, string>>({});
  const [addItemId, setAddItemId] = useState('');
  const [addQty, setAddQty] = useState('');
  const [editing, setEditing] = useState<{ soldierId: string | null; label: string | null; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effectiveUnit = isAdmin ? unitId : (raspUnitId ?? '');

  useEffect(() => {
    Promise.all([
      supabase.from('units').select('*').order('name'),
      supabase.from('teams').select('*').order('name'),
      listItems(), listBags(),
    ]).then(([u, t, i, b]) => {
      if (u.data) setUnits(u.data as Unit[]);
      if (t.data) setTeams(t.data as Team[]);
      setItems(i); setBagsState(b);
      const q: Record<string, string> = {}; for (const r of b) q[r.storage_item_id] = String(r.required);
      setStdQty(q);
    }).catch((e) => setError((e as Error).message));
  }, []);

  async function reloadUnit() {
    if (!effectiveUnit) { setSoldiers([]); setSoldierBags([]); return; }
    const [s, sb] = await Promise.all([
      supabase.from('soldiers').select('*').eq('unit_id', effectiveUnit).order('full_name'),
      listSoldierBags(effectiveUnit),
    ]);
    setSoldiers((s.data ?? []) as Soldier[]);
    setSoldierBags(sb);
  }
  useEffect(() => {
    setOpenTeams(new Set());
    reloadUnit().catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUnit]);

  const teamName = useMemo(() => {
    const m = new Map(teams.map((t) => [t.id, t.name]));
    return (id: string | null) => (id ? m.get(id) ?? 'ללא צוות' : 'ללא צוות');
  }, [teams]);

  const groups = useMemo(() => {
    const byTeam = new Map<string, { key: string; name: string; soldiers: Soldier[] }>();
    for (const s of soldiers) {
      const key = s.team_id ?? '__none__';
      if (!byTeam.has(key)) byTeam.set(key, { key, name: teamName(s.team_id), soldiers: [] });
      byTeam.get(key)!.soldiers.push(s);
    }
    return Array.from(byTeam.values())
      .map((g) => ({ ...g, soldiers: [...g.soldiers].sort((a, b) => a.full_name.localeCompare(b.full_name, 'he')) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [soldiers, teamName]);

  // Items that make up a bag: the standard set, or all items when no standard.
  const basisItems = useMemo(() => {
    if (bags.length === 0) return items;
    const ids = new Set(bags.map((b) => b.storage_item_id));
    return items.filter((i) => ids.has(i.id));
  }, [bags, items]);

  // Generic bags = distinct bag_label among soldier-less rows.
  const genericBags = useMemo(() => {
    const labels = new Set<string>();
    for (const r of soldierBags) if (!r.soldier_id && r.bag_label) labels.add(r.bag_label);
    return [...labels].sort((a, b) => a.localeCompare(b, 'he'));
  }, [soldierBags]);

  const bagCountFor = (soldierId: string) => soldierBags.filter((r) => r.soldier_id === soldierId).length;
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  function addStandardItem() {
    const n = Number(addQty);
    if (!addItemId || !(n > 0)) return;
    setStdQty((p) => ({ ...p, [addItemId]: String(n) }));
    setAddItemId(''); setAddQty('');
  }

  function initialFor(soldierId: string | null, label: string | null): Record<string, string> {
    const q: Record<string, string> = {};
    for (const r of soldierBags) {
      if (soldierId ? r.soldier_id === soldierId : (!r.soldier_id && r.bag_label === label)) q[r.storage_item_id] = String(r.quantity);
    }
    return q;
  }

  async function saveStandard() {
    setBusy(true); setError(null); setSuccess(null);
    try {
      const q: Record<string, number> = {};
      for (const [k, v] of Object.entries(stdQty)) { const n = Number(v); if (n > 0) q[k] = n; }
      await setBags(q);
      setBagsState(await listBags());
      setSuccess('תקן התיק עודכן');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function saveBag(quantities: Record<string, number>) {
    if (!editing || !effectiveUnit) return;
    setBusy(true); setError(null);
    try {
      await setSoldierBag({ soldierId: editing.soldierId, unitId: effectiveUnit, bagLabel: editing.label, quantities });
      setSuccess('התיק עודכן');
      setEditing(null);
      await reloadUnit();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  function addGeneric() {
    const label = prompt('שם התיק הגנרי:');
    if (!label?.trim()) return;
    setEditing({ soldierId: null, label: label.trim(), title: `תיק גנרי — ${label.trim()}` });
  }

  if (!isAdmin && !isRaspar) return <Navigate to="/" replace />;

  return (
    <div className="space-y-5">
      <PageTitle title="תיקי לוחם" subtitle="תקן גדודי אחיד ותיקי לוחם פר חייל" />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex justify-between">
          {error}<button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 ml-2">×</button>
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-emerald-800 text-sm flex justify-between">
          {success}<button onClick={() => setSuccess(null)} className="text-emerald-600 hover:text-emerald-900 ml-2">×</button>
        </div>
      )}

      {/* Standard bag — admin only */}
      {isAdmin && (
        <div className="card space-y-3">
          <h3 className="font-semibold">תקן תיק לוחם (גדודי אחיד)</h3>
          {/* Add: pick an item, then its quantity */}
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <label className="label">פריט</label>
              <select className="input" value={addItemId} onChange={(e) => setAddItemId(e.target.value)}>
                <option value="">— בחר פריט —</option>
                {items.filter((it) => stdQty[it.id] == null).map((it) => (
                  <option key={it.id} value={it.id}>{it.name}{it.uom ? ` (${it.uom})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="w-28">
              <label className="label">כמות תקן</label>
              <input type="number" min="1" className="input" value={addQty} onChange={(e) => setAddQty(e.target.value)} />
            </div>
            <button type="button" onClick={addStandardItem} disabled={!addItemId || !(Number(addQty) > 0)}
              className="btn-secondary disabled:opacity-40">+ הוסף</button>
          </div>

          {/* Current standard */}
          {Object.keys(stdQty).length === 0 ? (
            <p className="text-sm text-slate-400">לא הוגדר תקן — הוסף פריטים</p>
          ) : (
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {Object.keys(stdQty).map((id) => (
                <li key={id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="font-medium">{itemById.get(id)?.name ?? '—'}
                    <span className="text-xs text-slate-400 mr-1">{itemById.get(id)?.uom ?? ''}</span></span>
                  <span className="flex items-center gap-2">
                    <input type="number" min="0" className="input !py-1 text-center w-20"
                      value={stdQty[id]} onChange={(e) => setStdQty((p) => ({ ...p, [id]: e.target.value }))} />
                    <button onClick={() => setStdQty((p) => { const n = { ...p }; delete n[id]; return n; })}
                      className="text-red-400 hover:text-red-600">×</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={saveStandard} disabled={busy} className="btn-primary">עדכן תקן</button>
        </div>
      )}

      {/* Unit selection */}
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
          {/* Generic bags */}
          <div className="card space-y-2">
            <div className="flex items-center justify-between">
              <label className="label !mb-0">תיקים גנריים</label>
              <button type="button" onClick={addGeneric} className="btn-secondary !py-1 !px-3 text-sm">+ תיק גנרי</button>
            </div>
            {genericBags.length === 0 ? <p className="text-xs text-slate-400">אין תיקים גנריים</p> : (
              <div className="flex flex-wrap gap-2">
                {genericBags.map((label) => (
                  <span key={label} className="badge bg-slate-100 text-slate-700 flex items-center gap-1.5">
                    <button onClick={() => setEditing({ soldierId: null, label, title: `תיק גנרי — ${label}` })} className="hover:text-emerald-700">{label}</button>
                    <button onClick={() => { if (confirm('למחוק את התיק הגנרי?')) deleteGenericBag(effectiveUnit, label).then(reloadUnit).catch((e) => setError((e as Error).message)); }}
                      className="text-red-400 hover:text-red-600">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Soldiers by team (collapsible) */}
          <div className="space-y-2">
            {groups.map((g) => {
              const open = openTeams.has(g.key);
              return (
                <div key={g.key} className="card p-0 overflow-hidden">
                  <button type="button" onClick={() => setOpenTeams((p) => { const n = new Set(p); n.has(g.key) ? n.delete(g.key) : n.add(g.key); return n; })}
                    className="w-full flex items-center gap-2 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50">
                    <span className="text-slate-400">{open ? '−' : '+'}</span>
                    {g.name}<span className="text-xs text-slate-400 font-normal">({g.soldiers.length})</span>
                  </button>
                  {open && (
                    <ul className="divide-y divide-slate-100 border-t border-slate-100">
                      {g.soldiers.map((s) => {
                        const c = bagCountFor(s.id);
                        return (
                          <li key={s.id}>
                            <button type="button" onClick={() => setEditing({ soldierId: s.id, label: null, title: s.full_name })}
                              className="w-full flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-slate-50 text-right">
                              <span><span className="font-medium text-slate-800">{s.full_name}</span>
                                <span className="text-xs text-slate-400 mr-2">{s.personal_number}</span></span>
                              {c > 0 ? <span className="badge bg-emerald-100 text-emerald-700 text-xs">{c} פריטים</span>
                                     : <span className="text-xs text-slate-300">תיק ריק</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {editing && (
        <BagModal title={editing.title} basisItems={basisItems}
          initial={initialFor(editing.soldierId, editing.label)} busy={busy}
          onClose={() => setEditing(null)} onSave={saveBag} />
      )}
    </div>
  );
}

// ── Bag editor modal with autocomplete search ────────────────────────────────────
function BagModal({
  title, basisItems, initial, busy, onClose, onSave,
}: {
  title: string;
  basisItems: StorageItem[];
  initial: Record<string, string>;
  busy: boolean;
  onClose: () => void;
  onSave: (quantities: Record<string, number>) => void;
}) {
  const [qty, setQty] = useState<Record<string, string>>(initial);
  const [search, setSearch] = useState('');
  const shown = search.trim() ? basisItems.filter((i) => i.name.includes(search.trim())) : basisItems;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>
        <input className="input mb-3" placeholder="חיפוש פריט…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="flex-1 overflow-auto border border-slate-200 rounded-lg">
          <table className="w-full text-sm">
            <tbody>
              {shown.map((it) => (
                <tr key={it.id} className="border-b border-slate-100 last:border-0">
                  <td className="p-2">{it.name}<span className="text-xs text-slate-400 mr-1">{it.uom ?? ''}</span></td>
                  <td className="p-2 w-24 text-center">
                    <input type="number" min="0" className="input !py-1 text-center w-20"
                      value={qty[it.id] ?? ''} onChange={(e) => setQty((p) => ({ ...p, [it.id]: e.target.value }))} />
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td className="p-3 text-center text-slate-400">אין פריטים</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="btn-secondary">ביטול</button>
          <button disabled={busy} onClick={() => {
            const q: Record<string, number> = {};
            for (const [k, v] of Object.entries(qty)) { const n = Number(v); if (n > 0) q[k] = n; }
            onSave(q);
          }} className="btn-primary">{busy ? '…' : 'עדכון'}</button>
        </div>
      </div>
    </div>
  );
}
