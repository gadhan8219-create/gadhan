import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { WeaponsItem } from '../../lib/database.types';

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
  serial_number: string;
  assigned_at: string | null;
}

interface SelectedItem {
  serial: string;
  quantity: string;
  preloaded?: boolean; // already held by soldier
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

// ── Signature Pad ─────────────────────────────────────────────────────────────

interface SignaturePadHandle {
  isEmpty: () => boolean;
  toDataUrl: () => string; // base64 PNG, no data: prefix
  clear: () => void;
}

const SignaturePad = forwardRef<SignaturePadHandle>((_props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing   = useRef(false);
  const drawn     = useRef(false);
  const [empty, setEmpty] = useState(true);

  function initCtx(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) initCtx(canvas);
  }, []);

  // Map CSS client coords → canvas pixel coords
  function toCanvasPos(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left)  / rect.width)  * canvas.width,
      y: ((clientY - rect.top)   / rect.height) * canvas.height,
    };
  }

  function startDraw(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = toCanvasPos(canvas, clientX, clientY);
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    drawing.current = true;
  }

  function continueDraw(clientX: number, clientY: number) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = toCanvasPos(canvas, clientX, clientY);
    const ctx = canvas.getContext('2d')!;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    drawn.current = true;
    setEmpty(false);
  }

  function stopDraw() { drawing.current = false; }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    initCtx(canvas);
    drawn.current = false;
    setEmpty(true);
  }

  useImperativeHandle(ref, () => ({
    isEmpty: () => !drawn.current,
    toDataUrl: () => canvasRef.current?.toDataURL('image/png').split(',')[1] ?? '',
    clear,
  }));

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={600}
        height={140}
        className="w-full border border-slate-200 rounded-lg cursor-crosshair touch-none bg-white"
        style={{ height: '120px' }}
        onMouseDown={(e) => startDraw(e.clientX, e.clientY)}
        onMouseMove={(e) => continueDraw(e.clientX, e.clientY)}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={(e) => { e.preventDefault(); const t = e.touches[0]; startDraw(t.clientX, t.clientY); }}
        onTouchMove={(e)  => { e.preventDefault(); const t = e.touches[0]; continueDraw(t.clientX, t.clientY); }}
        onTouchEnd={(e)   => { e.preventDefault(); stopDraw(); }}
      />
      <div className="flex justify-between items-center mt-1.5">
        <span className={`text-xs ${empty ? 'text-slate-400' : 'text-emerald-600 font-medium'}`}>
          {empty ? 'חתום כאן...' : 'חתימה הוזנה ✓'}
        </span>
        {!empty && (
          <button type="button" onClick={clear}
            className="text-xs text-slate-400 hover:text-red-500 transition">
            נקה
          </button>
        )}
      </div>
    </div>
  );
});
SignaturePad.displayName = 'SignaturePad';

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
  const [, setAssignments] = useState<Assignment[]>([]);
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

  // Items
  const [selected, setSelected] = useState<Record<string, SelectedItem>>({});
  const [search, setSearch] = useState('');

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
    setSelected({});
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

    // Load current assignments → pre-populate items
    const { data } = await supabase
      .from('weapons_item_serials')
      .select('item_id, serial_number, assigned_at, weapons_items(name)')
      .eq('assigned_to_pn', s.personal_number)
      .not('assigned_to_pn', 'is', null)
      .order('assigned_at', { ascending: false });

    if (data) {
      const asgn: Assignment[] = (data as any[]).map((r) => ({
        item_id: r.item_id,
        item_name: r.weapons_items?.name ?? '—',
        serial_number: r.serial_number,
        assigned_at: r.assigned_at,
      }));
      setAssignments(asgn);

      const preloaded: Record<string, SelectedItem> = {};
      for (const a of asgn) {
        preloaded[a.item_id] = { serial: a.serial_number, quantity: '1', preloaded: true };
      }
      setSelected(preloaded);
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
  const filteredItems        = weaponItems.filter((i) => i.name.includes(search));
  const newCount             = Object.values(selected).filter((s) => !s.preloaded).length;

  const activePN   = mode === 'existing' ? selectedSoldier?.personal_number ?? '' : newPN;
  const activeName = mode === 'existing' ? selectedSoldier?.full_name ?? '' : newName;

  // ── Items toggle ──────────────────────────────────────────────────────────

  function toggle(item: WeaponsItem) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = { serial: '', quantity: '1' };
      return next;
    });
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (mode === 'existing' && !selectedSoldier) { setError('נא לבחור חייל מהרשימה'); return; }
    if (mode === 'new' && (!newPN || !newName || !newPhone || !newUnitId || !newTeamId)) {
      setError('נא למלא את כל שדות החייל'); return;
    }

    const newItems = Object.entries(selected).filter(([, s]) => !s.preloaded);
    if (newItems.length === 0) { setError('נא לבחור לפחות פריט חדש להחתמה'); return; }

    for (const [itemId, sel] of newItems) {
      const item = weaponItems.find((i) => i.id === itemId);
      if (item?.has_serials) {
        if (!sel.serial.trim()) {
          setError(`נא לבחור מספר סידורי עבור: ${item.name}`); return;
        }
        const free = availableSerials[item.id] ?? [];
        if (!free.includes(sel.serial.trim())) {
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

      // 1. Save serial assignments to DB
      const dbUpdates: PromiseLike<unknown>[] = [];
      for (const [itemId, sel] of newItems) {
        const item = weaponItems.find((i) => i.id === itemId);
        if (!item?.has_serials || !sel.serial.trim()) continue;
        dbUpdates.push(
          supabase.from('weapons_item_serials')
            .update({ assigned_to_pn: activePN, assigned_to_name: activeName, assigned_at: now })
            .eq('item_id', itemId)
            .eq('serial_number', sel.serial.trim())
            .then()
        );
      }
      await Promise.all(dbUpdates);

      // 2. Build items payload for PDF
      const itemsPayload = newItems.map(([itemId, sel]) => {
        const item = weaponItems.find((i) => i.id === itemId);
        return {
          name:     item?.name ?? itemId,
          serial:   item?.has_serials ? sel.serial.trim() : null,
          quantity: item?.has_serials ? 1 : (parseInt(sel.quantity) || 1),
        };
      });

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

      // 4. Call edge function: generate PDF + upload to Drive
      const signaturePng = sigPadRef.current!.toDataUrl();
      const { data: { session } } = await supabase.auth.getSession();

      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-weapon-checkout-pdf`;
      const resp = await fetch(fnUrl, {
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
      });

      const result = await resp.json();
      if (!result.ok) throw new Error(result.error ?? 'שגיאה בהפקת הקובץ');

      setPdfUrl(result.url as string);
      setSuccess(true);
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
    setSelected({}); setSearch(''); setSuccess(false); setPdfUrl(null); setError(null);
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
                onClick={() => { setMode(m); setSelected({}); setAssignments([]); setSelectedSoldier(null); setSoldierSearch(''); setEditMode(false); }}
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
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-700">פריטים</h2>
            <div className="flex gap-2">
              {Object.values(selected).some((s) => s.preloaded) && (
                <span className="badge bg-amber-100 text-amber-700 text-xs">
                  {Object.values(selected).filter((s) => s.preloaded).length} בהחזקה
                </span>
              )}
              {newCount > 0 && (
                <span className="badge bg-emerald-100 text-emerald-700 text-xs">{newCount} חדשים</span>
              )}
            </div>
          </div>

          <input className="input" placeholder="חיפוש פריט..."
            value={search} onChange={(e) => setSearch(e.target.value)} />

          {weaponItems.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">טוען פריטים...</p>
          ) : (
            <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
              {filteredItems.map((item) => {
                const isSelected   = !!selected[item.id];
                const isPreloaded  = selected[item.id]?.preloaded === true;
                const free         = availableSerials[item.id] ?? [];
                const noSerials    = item.has_serials && free.length === 0 && !isPreloaded;

                return (
                  <div key={item.id}
                    className={`rounded-lg border transition ${
                      isPreloaded ? 'border-amber-300 bg-amber-50' :
                      isSelected  ? 'border-emerald-400 bg-emerald-50' :
                      noSerials   ? 'border-slate-200 opacity-50' : 'border-slate-200'
                    }`}>
                    <label className={`flex items-center gap-3 p-3 ${noSerials ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        className="accent-emerald-600 w-4 h-4 shrink-0"
                        checked={isSelected}
                        disabled={noSerials}
                        onChange={() => toggle(item)}
                      />
                      <span className="text-sm font-medium text-slate-800 flex-1">{item.name}</span>
                      {isPreloaded && <span className="text-xs text-amber-600 shrink-0">בהחזקה</span>}
                      {noSerials   && <span className="text-xs text-slate-400 shrink-0">כל הצ׳ים משויכים</span>}
                      {!isPreloaded && item.has_serials && free.length > 0 && (
                        <span className="text-xs text-slate-400 shrink-0">{free.length} זמינים</span>
                      )}
                      {!isPreloaded && !item.has_serials && item.quantity != null && (
                        <span className="text-xs text-slate-400 shrink-0">מלאי: {item.quantity}</span>
                      )}
                    </label>

                    {isSelected && (
                      <div className="px-3 pb-3">
                        {item.has_serials ? (
                          isPreloaded ? (
                            <>
                              <label className="label text-xs">מספר סידורי (צ׳)</label>
                              <input
                                className="input text-sm font-mono bg-amber-50"
                                dir="ltr"
                                value={selected[item.id].serial}
                                readOnly
                              />
                            </>
                          ) : (
                            <>
                              <label className="label text-xs">מספר סידורי (צ׳)</label>
                              <SerialPicker
                                serials={free}
                                value={selected[item.id].serial}
                                onChange={(v) => setSelected((p) => ({ ...p, [item.id]: { ...p[item.id], serial: v } }))}
                              />
                            </>
                          )
                        ) : (
                          <>
                            <label className="label text-xs">
                              כמות
                              {item.quantity != null && <span className="text-slate-400 font-normal"> (מקסימום {item.quantity})</span>}
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={item.quantity ?? 9999}
                              className="input text-sm w-28"
                              value={selected[item.id].quantity}
                              readOnly={isPreloaded}
                              onChange={(e) => {
                                if (isPreloaded) return;
                                const max = item.quantity ?? 9999;
                                const v = Math.min(Math.max(1, parseInt(e.target.value) || 1), max);
                                setSelected((p) => ({ ...p, [item.id]: { ...p[item.id], quantity: String(v) } }));
                              }}
                            />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredItems.length === 0 && weaponItems.length > 0 && (
                <p className="text-sm text-slate-400 text-center py-4">לא נמצאו פריטים</p>
              )}
            </div>
          )}
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
