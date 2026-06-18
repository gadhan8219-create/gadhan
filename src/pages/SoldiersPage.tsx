import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { loadSoldierHeldItems, type HeldItem } from '../lib/heldItems';
import { getSoldierAttendance, type SoldierAttendanceRow } from '../lib/attendance';
import { loadSoldierBagItems, type SoldierBagItem } from '../lib/imach';
import type { Soldier, Team, Unit } from '../lib/database.types';

export default function SoldiersPage() {
  const { profile } = useAuth();
  const [soldiers, setSoldiers] = useState<Soldier[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ full_name: '', personal_number: '', phone: '', unit_id: '', team_id: '' });
  const [selected, setSelected] = useState<Soldier | null>(null);
  const [heldItems, setHeldItems] = useState<HeldItem[] | null>(null);
  const [bag, setBag] = useState<SoldierBagItem[] | null>(null);
  const [heldLoading, setHeldLoading] = useState(false);
  const [attendance, setAttendance] = useState<SoldierAttendanceRow[] | null>(null);
  const [attLoading, setAttLoading] = useState(false);
  const [attFrom, setAttFrom] = useState('');
  const [attTo, setAttTo] = useState('');
  const isAdmin = profile?.role === 'admin';

  async function load() {
    const [s, u, t] = await Promise.all([
      supabase.from('soldiers').select('*').order('full_name'),
      supabase.from('units').select('*').order('name'),
      supabase.from('teams').select('*').order('name'),
    ]);
    if (s.data) setSoldiers(s.data);
    if (u.data) setUnits(u.data);
    if (t.data) setTeams(t.data);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (!isAdmin && profile?.unit_id) setForm((f) => ({ ...f, unit_id: profile.unit_id! })); }, [isAdmin, profile?.unit_id]);

  const filtered = soldiers.filter(
    (s) => s.full_name.includes(search) || s.personal_number.includes(search)
  );

  async function openSoldier(s: Soldier) {
    setSelected(s);
    setHeldItems(null);
    setBag(null);
    setAttendance(null);
    setAttFrom('');
    setAttTo('');
    setHeldLoading(true);
    try {
      const [held, bagItems] = await Promise.all([
        loadSoldierHeldItems(s.id, s.personal_number),
        loadSoldierBagItems(s.id),
      ]);
      setHeldItems(held);
      setBag(bagItems);
    } finally {
      setHeldLoading(false);
    }
  }

  // Load (and reload) the soldier's דוח 1 entries whenever the selection or the
  // date range changes. Empty range = the most recent entries.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setAttLoading(true);
    getSoldierAttendance(selected.id, { from: attFrom || null, to: attTo || null })
      .then((rows) => { if (!cancelled) setAttendance(rows); })
      .catch(() => { if (!cancelled) setAttendance([]); })
      .finally(() => { if (!cancelled) setAttLoading(false); });
    return () => { cancelled = true; };
  }, [selected, attFrom, attTo]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{7}$/.test(form.personal_number)) {
      return alert('מספר אישי חייב להיות 7 ספרות בדיוק');
    }
    if (!/^05\d{8}$/.test(form.phone)) {
      return alert('טלפון חייב להיות מספר סלולרי ישראלי תקין (05XXXXXXXX)');
    }
    const { data, error } = await supabase.from('soldiers').insert({
      full_name: form.full_name,
      personal_number: form.personal_number,
      phone: form.phone,
      unit_id: form.unit_id,
      team_id: form.team_id || null,
    }).select().single();
    if (error) return alert(error.message);
    await logAudit({ action: 'soldier.create', targetType: 'soldier', targetId: data.id, details: { name: form.full_name } });
    setForm({ full_name: '', personal_number: '', phone: '', unit_id: isAdmin ? '' : profile?.unit_id ?? '', team_id: '' });
    setShowAdd(false);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">חיילים</h2>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary">
          {showAdd ? 'בטל' : '+ חייל חדש'}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="card mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="label">שם מלא</label>
            <input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
          </div>
          <div>
            <label className="label">מספר אישי</label>
            <input
              className="input"
              inputMode="numeric"
              pattern="\d{7}"
              title="7 ספרות בדיוק"
              maxLength={7}
              value={form.personal_number}
              onChange={(e) => setForm({ ...form, personal_number: e.target.value.replace(/\D/g, '') })}
              required
            />
          </div>
          <div>
            <label className="label">טלפון</label>
            <input
              className="input"
              inputMode="tel"
              pattern="05\d{8}"
              title="מספר סלולרי ישראלי: 05XXXXXXXX"
              maxLength={10}
              placeholder="05XXXXXXXX"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })}
              required
            />
          </div>
          <div>
            <label className="label">מסגרת</label>
            <select className="input" value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: e.target.value, team_id: '' })} disabled={!isAdmin} required>
              <option value="">— בחר —</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">צוות</label>
            <select
              className="input"
              value={form.team_id}
              onChange={(e) => setForm({ ...form, team_id: e.target.value })}
              disabled={!form.unit_id || teams.filter((t) => t.unit_id === form.unit_id).length === 0}
            >
              <option value="">— ללא —</option>
              {teams.filter((t) => t.unit_id === form.unit_id).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 md:col-span-5 flex justify-end">
            <button type="submit" className="btn-primary">שמור</button>
          </div>
        </form>
      )}

      <div className="card">
        <input
          className="input mb-4"
          placeholder="חיפוש לפי שם או מס' אישי..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="table-wrap">
        <table className="table-base">
          <thead>
            <tr>
              <th>שם מלא</th>
              <th>מספר אישי</th>
              <th>טלפון</th>
              <th>מסגרת</th>
              <th>צוות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td>
                  <button
                    type="button"
                    onClick={() => openSoldier(s)}
                    className="text-emerald-700 hover:text-emerald-900 hover:underline font-medium text-right"
                  >
                    {s.full_name}
                  </button>
                </td>
                <td>{s.personal_number}</td>
                <td>{s.phone ?? '—'}</td>
                <td>{units.find((u) => u.id === s.unit_id)?.name ?? '—'}</td>
                <td>{teams.find((t) => t.id === s.team_id)?.name ?? '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="text-center text-slate-500 py-6">אין נתונים</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {selected && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold">{selected.full_name}</h3>
                <div className="text-xs text-slate-500 mt-1">
                  מס׳ אישי {selected.personal_number}
                  {' · '}
                  {units.find((u) => u.id === selected.unit_id)?.name ?? '—'}
                  {selected.team_id && (
                    <> {' · '} {teams.find((t) => t.id === selected.team_id)?.name ?? '—'}</>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-slate-700 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="text-sm font-semibold text-slate-700 mb-2">פריטים חתומים</div>
            {heldLoading ? (
              <div className="text-sm text-slate-500">טוען...</div>
            ) : !heldItems || heldItems.length === 0 ? (
              <div className="text-sm text-slate-500">אין פריטים חתומים</div>
            ) : (
              <div className="max-h-72 overflow-auto space-y-3">
                {([['weapons', 'נשק'], ['radio', 'קשר']] as const).map(([src, label]) => {
                  const group = heldItems.filter((h) => h.source === src);
                  if (group.length === 0) return null;
                  return (
                    <div key={src}>
                      <div className="text-xs font-semibold text-slate-400 mb-1">{label}</div>
                      <ul className="text-sm space-y-1">
                        {group.map((h) => (
                          <li
                            key={`${h.itemId}::${h.serialNumber ?? ''}`}
                            className="flex justify-between border-b border-slate-100 py-1.5"
                          >
                            <span>
                              {h.itemName}
                              {h.serialNumber && (
                                <span className="text-slate-500 text-xs"> [צ' {h.serialNumber}]</span>
                              )}
                              {h.zeroed && (
                                <span className="badge bg-orange-100 text-orange-700 text-xs mr-1">
                                  מאופסן{h.zeroedNote ? `: ${h.zeroedNote}` : ''}
                                </span>
                              )}
                            </span>
                            <span className="text-slate-600">x{h.quantity}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="text-sm font-semibold text-slate-700 mb-2 mt-5">תיק לוחם</div>
            {heldLoading ? (
              <div className="text-sm text-slate-500">טוען...</div>
            ) : !bag || bag.length === 0 ? (
              <div className="text-sm text-slate-500">אין תיק לוחם</div>
            ) : (
              <ul className="text-sm space-y-1 max-h-48 overflow-auto">
                {bag.map((b) => (
                  <li key={b.itemName} className="flex justify-between border-b border-slate-100 py-1.5">
                    <span>{b.itemName}{b.uom && <span className="text-slate-400 text-xs"> {b.uom}</span>}</span>
                    <span className="text-slate-600">x{b.quantity}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="text-sm font-semibold text-slate-700 mb-2 mt-5">דוח 1</div>
            <div className="flex items-end gap-2 mb-2">
              <div className="flex-1">
                <label className="label text-xs">מתאריך</label>
                <input type="date" className="input !py-1.5 text-sm" value={attFrom}
                  max={attTo || undefined} onChange={(e) => setAttFrom(e.target.value)} />
              </div>
              <div className="flex-1">
                <label className="label text-xs">עד תאריך</label>
                <input type="date" className="input !py-1.5 text-sm" value={attTo}
                  min={attFrom || undefined} onChange={(e) => setAttTo(e.target.value)} />
              </div>
              {(attFrom || attTo) && (
                <button type="button" onClick={() => { setAttFrom(''); setAttTo(''); }}
                  className="text-xs text-slate-400 hover:text-slate-700 pb-2">נקה</button>
              )}
            </div>
            {attLoading ? (
              <div className="text-sm text-slate-500">טוען...</div>
            ) : !attendance || attendance.length === 0 ? (
              <div className="text-sm text-slate-500">אין דיווחי נוכחות</div>
            ) : (
              <ul className="text-sm space-y-1 max-h-48 overflow-auto">
                {attendance.map((a) => (
                  <li key={a.date} className="flex justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-600">{new Date(a.date + 'T00:00:00').toLocaleDateString('he-IL')}</span>
                    <span className="font-medium">{a.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
