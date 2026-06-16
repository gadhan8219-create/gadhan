import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { WeaponsItem } from '../../lib/database.types';
import SignaturePad, { type SignaturePadHandle } from '../../components/SignaturePad';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SoldierRow {
  id: string;
  full_name: string;
  personal_number: string;
  phone: string | null;
  unit_id: string;
  team_id: string | null;
  unit_name: string;
  team_name: string | null;
}

interface UnitRow  { id: string; name: string; }
interface TeamRow  { id: string; unit_id: string; name: string; }

interface Assignment {
  item_id: string;
  item_name: string;
  has_serials: boolean;
  serial_number: string;
  assigned_at: string | null;
}

interface WeaponLine {
  itemId: string;
  serial: string;
  quantity: string;
}

interface EditForm {
  phone: string;
  unit_id: string;
  team_id: string;
  busy: boolean;
}

type Mode = 'existing' | 'new';

// ── Serial Picker ─────────────────────────────────────────────────────────────
// Dropdown that only allows selecting from the available-serials list.
// `value` = confirmed selection; parent receives '' until a valid serial is chosen.

function SerialPicker({
  serials,
  value,
  onChange,
}: {
  serials: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [query, setQuery]   = useState(value);
  const [open,  setOpen]    = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync display when parent clears value
  useEffect(() => { if (!value) setQuery(''); }, [value]);

  // Close dropdown on outside click; revert query if not confirmed
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (query && !serials.includes(query)) setQuery(value); // revert invalid
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [query, value, serials]);

  const filtered = serials.filter((s) =>
    !query.trim() || s.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const isInvalid = !!query.trim() && !serials.includes(query.trim());

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          className={`input text-sm font-mono ${
            isInvalid ? 'border-red-400 bg-red-50' :
            value      ? 'border-emerald-400 bg-emerald-50' : ''
          }`}
          dir="ltr"
          placeholder="הקלד או בחר מ.ס..."
          autoComplete="off"
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            setOpen(true);
            // Auto-confirm on exact match
            onChange(serials.includes(v.trim()) ? v.trim() : '');
          }}
          onFocus={() => setOpen(true)}
        />
        {query && (
          <button
            type="button"
            className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-lg leading-none"
            onMouseDown={(e) => { e.preventDefault(); setQuery(''); onChange(''); setOpen(false); }}>
            ×
          </button>
        )}
      </div>
      {isInvalid && (
        <p className="text-xs text-red-500 mt-0.5">מספר סידורי לא קיים ברשימה</p>
      )}
      {open && (
        filtered.length > 0 ? (
          <ul className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-auto">
            {filtered.map((s) => (
              <li
                key={s}
                onMouseDown={(e) => { e.preventDefault(); setQuery(s); onChange(s); setOpen(false); }}
                className={`px-3 py-2 text-sm font-mono cursor-pointer hover:bg-slate-50 ${
                  s === value ? 'bg-emerald-50 text-emerald-700 font-semibold' : ''
                }`}
                dir="ltr">
                {s}
              </li>
            ))}
          </ul>
        ) : query.trim() ? (
          <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow p-2 text-sm text-slate-400 text-center">
            לא נמצא ברשימה
          </div>
        ) : null
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WeaponsCheckoutPage() {
  const { profile } = useAuth();
  const sigPadRef = useRef<SignaturePadHandle>(null);

  // DB data
  const [soldiers, setSoldiers] = useState<SoldierRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [weaponItems, setWeaponItems] = useState<WeaponsItem[]>([]);
  const [availableSerials, setAvailableSerials] = useState<Record<string, string[]>>({});

  // Mode
  const [mode, setMode] = useState<Mode>('existing');

  // Existing soldier
  const [soldierSearch, setSoldierSearch] = useState('');
  const [selectedSoldier, setSelectedSoldier] = useState<SoldierRow | null>(null);
  const [suggestions, setSuggestions] = useState<SoldierRow[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);

  // Edit soldier details
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({ phone: '', unit_id: '', team_id: '', busy: false });

  // New soldier
  const [newPN, setNewPN] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newUnitId, setNewUnitId] = useState('');
  const [newTeamId, setNewTeamId] = useState('');

  // Items — lines approach
  const [lines, setLines] = useState<WeaponLine[]>([{ itemId: '', serial: '', quantity: '1' }]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Load DB ──────────────────────────────────────────────────────────────

  async function loadAll() {
    const [sol, un, tm, wi, ser] = await Promise.all([
      supabase.from('soldiers').select('*, units(name), teams(name)').order('full_name'),
      supabase.from('units').select('*').order('name'),
      supabase.from('teams').select('*').order('name'),
      supabase.from('weapons_items').select('*').eq('active', true).order('name'),
      supabase.from('weapons_item_serials').select('item_id, serial_number').is('assigned_to_pn', null).order('serial_number'),
    ]);

    if (sol.data) {
      setSoldiers(sol.data.map((s: any) => ({
        ...s,
        unit_name: s.units?.name ?? '—',
        team_name: s.teams?.name ?? null,
      })));
    }
    if (un.data) setUnits(un.data);
    if (tm.data) setTeams(tm.data);
    if (wi.data) setWeaponItems(wi.data);

    const map: Record<string, string[]> = {};
    for (const row of (ser.data ?? []) as Array<{ item_id: string; serial_number: string }>) {
      if (!map[row.item_id]) map[row.item_id] = [];
      map[row.item_id].push(row.serial_number);
    }
    setAvailableSerials(map);
  }

  useEffect(() => { loadAll(); }, []);

  // Close suggestions on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSugg(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // ── Soldier search ────────────────────────────────────────────────────────

  function handleSearchChange(val: string) {
    setSoldierSearch(val);
    setSelectedSoldier(null);
    setAssignments([]);
    setLines([{ itemId: '', serial: '', quantity: '1' }]);
    setEditMode(false);
    if (!val.trim()) { setSuggestions([]); setShowSugg(false); return; }
    const lower = val.toLowerCase();
    const matches = soldiers.filter(
      (s) => s.full_name.includes(val) || s.personal_number.includes(val) || s.full_name.toLowerCase().includes(lower)
    ).slice(0, 8);
    setSuggestions(matches);
    setShowSugg(true);
  }

  async function selectSoldier(s: SoldierRow) {
    setSelectedSoldier(s);
    setSoldierSearch(`${s.full_name} (${s.personal_number})`);
    setShowSugg(false);
    setEditMode(false);
    setEditForm({ phone: s.phone ?? '', unit_id: s.unit_id, team_id: s.team_id ?? '', busy: false });

    // Load current assignments → display as read-only amber card
    const { data } = await supabase
      .from('weapons_item_serials')
      .select('item_id, serial_number, assigned_at, weapons_items(name, has_serials)')
      .eq('assigned_to_pn', s.personal_number)
      .not('assigned_to_pn', 'is', null)
      .order('assigned_at', { ascending: false });

    if (data) {
      const asgn: Assignment[] = (data as any[]).map((r) => ({
        item_id: r.item_id,
        item_name: r.weapons_items?.name ?? '—',
        has_serials: r.weapons_items?.has_serials ?? true,
        serial_number: r.serial_number,
        assigned_at: r.assigned_at,
      }));
      setAssignments(asgn);
      setLines([{ itemId: '', serial: '', quantity: '1' }]);
    }
  }

  // ── Edit soldier details ──────────────────────────────────────────────────

  async function saveEditSoldier() {
    if (!selectedSoldier) return;
    setEditForm((f) => ({ ...f, busy: true }));
    const { error } = await supabase.from('soldiers').update({
      phone: editForm.phone.trim() || null,
      unit_id: editForm.unit_id || undefined,
      team_id: editForm.team_id || null,
    }).eq('id', selectedSoldier.id);
    if (error) { alert(error.message); setEditForm((f) => ({ ...f, busy: false })); return; }

    const unitName = units.find((u) => u.id === editForm.unit_id)?.name ?? '—';
    const teamName = teams.find((t) => t.id === editForm.team_id)?.name ?? null;
    setSelectedSoldier({ ...selectedSoldier, phone: editForm.phone.trim() || null, unit_id: editForm.unit_id, team_id: editForm.team_id || null, unit_name: unitName, team_name: teamName });
    setEditMode(false);
    setEditForm((f) => ({ ...f, busy: false }));
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const filteredTeamsForEdit = teams.filter((t) => t.unit_id === editForm.unit_id);
  const filteredTeamsForNew  = teams.filter((t) => t.unit_id === newUnitId);
  const newCount             = lines.filter((l) => l.itemId).length;

  const activePN   = mode === 'existing' ? selectedSoldier?.personal_number ?? '' : newPN;
  const activeName = mode === 'existing' ? selectedSoldier?.full_name ?? '' : newName;

  // ── Line helpers ──────────────────────────────────────────────────────────

  function addLine() {
    setLines((prev) => [...prev, { itemId: '', serial: '', quantity: '1' }]);
  }
  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateLine(idx: number, patch: Partial<WeaponLine>) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (mode === 'existing' && !selectedSoldier) { setError('נא לבחור חייל מהרשימה'); return; }
    if (mode === 'new' && (!newPN || !newName || !newPhone || !newUnitId || !newTeamId)) {
      setError('נא למלא את כל שדות החייל'); return;
    }

    const validLines = lines.filter((l) => l.itemId);
    if (validLines.length === 0) { setError('נא לבחור לפחות פריט חדש להחתמה'); return; }

    for (const line of validLines) {
      const item = weaponItems.find((i) => i.id === line.itemId);
      if (item?.has_serials) {
        if (!line.serial.trim()) {
          setError(`נא לבחור מספר סידורי עבור: ${item.name}`); return;
        }
        const free = availableSerials[item.id] ?? [];
        if (!free.includes(line.serial.trim())) {
          setError(`מספר סידורי לא קיים ברשימה עבור: ${item.name}`); return;
        }
      }
    }

    if (sigPadRef.current?.isEmpty()) {
      setError('נא לחתום לפני השליחה'); return;
    }

    setLoading(true);
    setError(null);

    try {
      const now = new Date().toISOString();

      // 1. Save assignments to DB. Errors are surfaced (not swallowed): an RLS
      //    block on an UPDATE returns success with 0 rows, so we .select() the
      //    affected row and treat an empty result as a failure.
      const dbUpdates: Promise<void>[] = [];
      for (const line of validLines) {
        const item = weaponItems.find((i) => i.id === line.itemId);
        if (!item) continue;

        if (item.has_serials && line.serial.trim()) {
          // Serial item → assign the specific serial to the soldier
          const serial = line.serial.trim();
          dbUpdates.push((async () => {
            const { data, error } = await supabase.from('weapons_item_serials')
              .update({ assigned_to_pn: activePN, assigned_to_name: activeName, assigned_at: now })
              .eq('item_id', line.itemId)
              .eq('serial_number', serial)
              .is('assigned_to_pn', null) // only assign a currently-free serial
              .select('id');
            if (error) throw new Error(error.message);
            if (!data || data.length === 0) {
              throw new Error(`לא ניתן להחתים ${item.name} (${serial}) — ייתכן שאין הרשאה למסגרת זו או שהפריט כבר משויך`);
            }
          })());
        } else if (!item.has_serials) {
          // Non-serial item → insert one synthetic serial row per unit.
          // Serial is prefixed __qty__ so the rest of the UI can distinguish these
          // from real serial items without a schema change.
          const qty = parseInt(line.quantity) || 1;
          for (let i = 0; i < qty; i++) {
            dbUpdates.push((async () => {
              const { error } = await supabase.from('weapons_item_serials').insert({
                item_id: line.itemId,
                serial_number: `__qty__${crypto.randomUUID().replace(/-/g, '')}`,
                assigned_to_pn: activePN,
                assigned_to_name: activeName,
                assigned_at: now,
              });
              if (error) throw new Error(error.message);
            })());
          }
        }
      }
      await Promise.all(dbUpdates);

      // 2. Build items payload for PDF — ALL items the soldier currently holds
      //    (existing assignments + the ones just added), not only the new lines.
      //    Re-query after the DB update so the PDF reflects the true holding.
      const { data: held } = await supabase
        .from('weapons_item_serials')
        .select('serial_number, weapons_items(name)')
        .eq('assigned_to_pn', activePN)
        .not('assigned_to_pn', 'is', null);

      const isQty = (s: string) => s.startsWith('__qty__');
      const qtyMap = new Map<string, { name: string; qty: number }>();
      const itemsPayload: Array<{ name: string; serial: string | null; quantity: number }> = [];
      for (const r of (held ?? []) as any[]) {
        const name = r.weapons_items?.name ?? '—';
        if (isQty(r.serial_number)) {
          const cur = qtyMap.get(name);
          if (cur) cur.qty++; else qtyMap.set(name, { name, qty: 1 });
        } else {
          itemsPayload.push({ name, serial: r.serial_number, quantity: 1 });
        }
      }
      for (const v of qtyMap.values()) itemsPayload.push({ name: v.name, serial: null, quantity: v.qty });

      // 3. Gather soldier info for PDF
      const unitName = mode === 'existing'
        ? selectedSoldier!.unit_name
        : (units.find((u) => u.id === newUnitId)?.name ?? '');
      const teamName = mode === 'existing'
        ? (selectedSoldier!.team_name ?? undefined)
        : (teams.find((t) => t.id === newTeamId)?.name ?? undefined);
      const phone = mode === 'existing'
        ? (selectedSoldier!.phone ?? undefined)
        : newPhone || undefined;

      // 4. Show success immediately — PDF fires in background
      setSuccess(true);

      // 5. Fire PDF generation async (no await) — error email sent by backend if it fails
      const signaturePng = sigPadRef.current!.toDataUrl();
      const { data: { session } } = await supabase.auth.getSession();
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-weapon-checkout-pdf`;
      fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
          'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          title:    'החתמת נשק',
          soldier:  { full_name: activeName, personal_number: activePN, phone, unit_name: unitName, team_name: teamName },
          items:    itemsPayload,
          signature_png_b64: signaturePng,
          performed_by: profile?.full_name ?? '',
          timestamp:    now,
          drive_path:   ['נשקיה', unitName, 'החתמות'],
          filename:     `${activeName}.pdf`,
        }),
      })
        .then((r) => r.json())
        .then((result) => { if (result.ok) setPdfUrl(result.url as string); })
        .catch(() => { /* error email sent by backend */ });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setMode('existing');
    setSoldierSearch(''); setSelectedSoldier(null); setAssignments([]); setEditMode(false);
    setNewPN(''); setNewName(''); setNewPhone(''); setNewUnitId(''); setNewTeamId('');
    setLines([{ itemId: '', serial: '', quantity: '1' }]);
    setSuccess(false); setPdfUrl(null); setError(null);
    sigPadRef.current?.clear();
    loadAll();
  }

  // ── Success screen ────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="card space-y-5">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">הדוח נשלח בהצלחה</h2>
            <p className="text-slate-500 mt-1">{activeName} · {activePN}</p>
            <p className="text-slate-400 text-sm">{newCount} פריטים חדשים נרשמו</p>
          </div>
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition border border-blue-200 mx-auto"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              פתח PDF בגוגל Drive
            </a>
          )}
          <button className="btn-primary w-full" onClick={reset}>דוח חדש</button>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">החתמת נשק</h1>
        <p className="text-slate-500 text-sm mt-1">מבצע: {profile?.full_name}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── פרטי חייל ── */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-slate-700">פרטי חייל</h2>

          {/* Mode toggle */}
          <div className="flex gap-2">
            {(['existing', 'new'] as Mode[]).map((m) => (
              <button key={m} type="button"
                onClick={() => { setMode(m); setLines([{ itemId: '', serial: '', quantity: '1' }]); setAssignments([]); setSelectedSoldier(null); setSoldierSearch(''); setEditMode(false); }}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition ${
                  mode === m ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                }`}>
                {m === 'existing' ? 'חייל קיים' : 'חייל חדש'}
              </button>
            ))}
          </div>

          {/* Existing soldier */}
          {mode === 'existing' && (
            <div className="space-y-3">
              <div ref={searchRef} className="relative">
                <label className="label">חיפוש לפי מספר אישי או שם</label>
                <input className="input" placeholder="הקלד שם או מ.א..."
                  value={soldierSearch} onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSugg(true)}
                  autoComplete="off" />
                {showSugg && suggestions.length > 0 && (
                  <ul className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-auto">
                    {suggestions.map((s) => (
                      <li key={s.id} onMouseDown={() => selectSoldier(s)}
                        className="flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0">
                        <div>
                          <span className="font-medium text-sm">{s.full_name}</span>
                          <span className="text-xs text-slate-500 mr-2">{s.personal_number}</span>
                        </div>
                        <span className="text-xs text-slate-400">{s.unit_name}{s.team_name ? ` · ${s.team_name}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {selectedSoldier && !editMode && (
                <div className="bg-slate-50 rounded-lg p-3 text-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                      <span><span className="text-slate-500">שם: </span><span className="font-medium">{selectedSoldier.full_name}</span></span>
                      <span><span className="text-slate-500">מ.א: </span><span className="font-medium">{selectedSoldier.personal_number}</span></span>
                      {selectedSoldier.phone && <span><span className="text-slate-500">טל׳: </span>{selectedSoldier.phone}</span>}
                      <span><span className="text-slate-500">מסגרת: </span>{selectedSoldier.unit_name}</span>
                      {selectedSoldier.team_name && <span><span className="text-slate-500">צוות: </span>{selectedSoldier.team_name}</span>}
                    </div>
                    <button type="button" onClick={() => setEditMode(true)}
                      className="text-xs text-emerald-700 hover:text-emerald-900 shrink-0 mr-2">ערוך</button>
                  </div>
                </div>
              )}

              {/* Edit form */}
              {selectedSoldier && editMode && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-3">
                  <p className="text-sm font-medium text-emerald-800">עריכת פרטי חייל — {selectedSoldier.full_name}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="label text-xs">טלפון</label>
                      <input className="input text-sm" type="tel" value={editForm.phone}
                        onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label text-xs">מסגרת</label>
                      <select className="input text-sm" value={editForm.unit_id}
                        onChange={(e) => setEditForm((f) => ({ ...f, unit_id: e.target.value, team_id: '' }))}>
                        <option value="">בחר</option>
                        {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label text-xs">צוות</label>
                      <select className="input text-sm" value={editForm.team_id}
                        disabled={!editForm.unit_id}
                        onChange={(e) => setEditForm((f) => ({ ...f, team_id: e.target.value }))}>
                        <option value="">בחר</option>
                        {filteredTeamsForEdit.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setEditMode(false)} className="btn-secondary text-sm">בטל</button>
                    <button type="button" onClick={saveEditSoldier} disabled={editForm.busy} className="btn-primary text-sm">
                      {editForm.busy ? 'שומר...' : 'שמור'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* New soldier */}
          {mode === 'new' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">מספר אישי *</label>
                <input className="input" inputMode="numeric" maxLength={7} placeholder="7 ספרות"
                  value={newPN} onChange={(e) => setNewPN(e.target.value)} required />
              </div>
              <div>
                <label className="label">שם מלא *</label>
                <input className="input" placeholder="שם פרטי ומשפחה"
                  value={newName} onChange={(e) => setNewName(e.target.value)} required />
              </div>
              <div>
                <label className="label">טלפון *</label>
                <input className="input" type="tel" placeholder="05X-XXXXXXX"
                  value={newPhone} onChange={(e) => setNewPhone(e.target.value)} required />
              </div>
              <div>
                <label className="label">מסגרת *</label>
                <select className="input" value={newUnitId}
                  onChange={(e) => { setNewUnitId(e.target.value); setNewTeamId(''); }} required>
                  <option value="">בחר מסגרת</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">צוות *</label>
                <select className="input" value={newTeamId} onChange={(e) => setNewTeamId(e.target.value)}
                  disabled={!newUnitId} required>
                  <option value="">בחר צוות</option>
                  {filteredTeamsForNew.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* ── פריטים ── */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-700">פריטים</h2>
            {newCount > 0 && (
              <span className="badge bg-emerald-100 text-emerald-700 text-xs">{newCount} חדשים</span>
            )}
          </div>

          {/* Preloaded items (read-only amber card) */}
          {assignments.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs font-medium text-amber-700 mb-2">בהחזקת החייל ({assignments.length})</p>
              <div className="space-y-1.5">
                {/* Serial items — show individual serial numbers */}
                {assignments.filter((a) => a.has_serials).map((a) => (
                  <div key={`${a.item_id}-${a.serial_number}`} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{a.item_name}</span>
                    <span className="text-xs font-mono text-amber-700" dir="ltr">{a.serial_number}</span>
                  </div>
                ))}
                {/* Non-serial items — group by item and show quantity */}
                {(() => {
                  const qtyMap = new Map<string, { name: string; qty: number }>();
                  for (const a of assignments.filter((a) => !a.has_serials)) {
                    const cur = qtyMap.get(a.item_id);
                    if (cur) cur.qty++;
                    else qtyMap.set(a.item_id, { name: a.item_name, qty: 1 });
                  }
                  return [...qtyMap.entries()].map(([id, v]) => (
                    <div key={id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{v.name}</span>
                      <span className="text-xs text-amber-700">כמות: {v.qty}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

          {/* New item lines */}
          <div className="space-y-2">
            {lines.map((line, idx) => {
              const item = weaponItems.find((i) => i.id === line.itemId);
              // Items already in other lines or already assigned → exclude from dropdown
              const usedIds = new Set([
                ...lines.filter((_, i) => i !== idx).map((l) => l.itemId).filter(Boolean),
                ...assignments.map((a) => a.item_id),
              ]);
              const availableItems = weaponItems.filter((i) => !usedIds.has(i.id));
              const freeSerials = item ? (availableSerials[item.id] ?? []) : [];

              return (
                <div key={idx} className="flex gap-2 items-start">
                  {/* Item dropdown */}
                  <select
                    className="input text-sm flex-1"
                    value={line.itemId}
                    onChange={(e) => updateLine(idx, { itemId: e.target.value, serial: '', quantity: '1' })}
                  >
                    <option value="">בחר פריט...</option>
                    {availableItems.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                    {/* Keep current value visible even if it somehow fell out of availableItems */}
                    {line.itemId && !availableItems.find((i) => i.id === line.itemId) && item && (
                      <option value={line.itemId}>{item.name}</option>
                    )}
                  </select>

                  {/* Serial picker or quantity input */}
                  {item?.has_serials ? (
                    <div className="w-44 shrink-0">
                      <SerialPicker
                        serials={freeSerials}
                        value={line.serial}
                        onChange={(v) => updateLine(idx, { serial: v })}
                      />
                    </div>
                  ) : item ? (
                    <input
                      type="number"
                      min={1}
                      max={item.quantity ?? 9999}
                      className="input text-sm w-24 shrink-0"
                      value={line.quantity}
                      onChange={(e) => {
                        const max = item.quantity ?? 9999;
                        const v = Math.min(Math.max(1, parseInt(e.target.value) || 1), max);
                        updateLine(idx, { quantity: String(v) });
                      }}
                    />
                  ) : null}

                  {/* Remove line button (hidden when only one empty line remains) */}
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="mt-2 text-slate-400 hover:text-red-500 transition text-xl leading-none shrink-0">
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addLine}
            className="text-sm text-emerald-700 hover:text-emerald-900 font-medium transition">
            + הוסף פריט
          </button>
        </div>

        {/* ── חתימת החייל ── */}
        <div className="card space-y-3">
          <h2 className="font-semibold text-slate-700">חתימת החייל</h2>
          <SignaturePad ref={sigPadRef} />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm">{error}</div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? 'שולח...' : 'שלח'}
        </button>
      </form>
    </div>
  );
}
