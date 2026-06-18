import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { loadSoldierHeldItems, type HeldItem } from '../lib/heldItems';
import { fireDrivePdf } from '../lib/drivePdf';
import { loadUnitAvailability, type UnitAvailability } from '../lib/unitStock';
import type { Item, Soldier, Team, Unit } from '../lib/database.types';
import SignaturePad, { type SignaturePadHandle } from '../components/SignaturePad';

type LineItem = { itemId: string; quantity: number; serialNumber: string };

interface EditForm { phone: string; unit_id: string; team_id: string; busy: boolean }

export default function SignFormPage() {
  const { profile } = useAuth();
  const sigPadRef = useRef<SignaturePadHandle>(null);

  // DB data
  const [units,    setUnits]    = useState<Unit[]>([]);
  const [teams,    setTeams]    = useState<Team[]>([]);
  const [items,    setItems]    = useState<Item[]>([]);
  const [soldiers, setSoldiers] = useState<Soldier[]>([]);

  // Soldier selection
  const [useExisting,      setUseExisting]      = useState(true);
  const [soldierSearch,    setSoldierSearch]    = useState('');
  const [selectedSoldier,  setSelectedSoldier]  = useState<Soldier | null>(null);
  const [suggestions,      setSuggestions]      = useState<Soldier[]>([]);
  const [showSugg,         setShowSugg]         = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // New soldier
  const [newSoldier, setNewSoldier] = useState({ full_name: '', personal_number: '', phone: '' });
  const [newUnitId,  setNewUnitId]  = useState('');
  const [newTeamId,  setNewTeamId]  = useState('');

  // Edit soldier
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({ phone: '', unit_id: '', team_id: '', busy: false });

  // Derived unit/team for availability
  const [unitId, setUnitId] = useState('');
  const [teamId, setTeamId] = useState('');

  // Items
  const [lines,        setLines]        = useState<LineItem[]>([{ itemId: '', quantity: 1, serialNumber: '' }]);
  const [heldItems,    setHeldItems]    = useState<HeldItem[]>([]);
  const [availability, setAvailability] = useState<UnitAvailability[]>([]);

  const [notes,      setNotes]      = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback,   setFeedback]   = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // ── Load data ───────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const [u, t, i, s] = await Promise.all([
        supabase.from('units').select('*').order('name'),
        supabase.from('teams').select('*').order('name'),
        supabase.from('items').select('*').eq('active', true).order('name'),
        supabase.from('soldiers').select('*').order('full_name'),
      ]);
      if (u.data) setUnits(u.data);
      if (t.data) setTeams(t.data);
      if (i.data) setItems(i.data);
      if (s.data) setSoldiers(s.data);
    })();
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSugg(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load availability when unit changes
  useEffect(() => {
    if (!unitId) { setAvailability([]); return; }
    loadUnitAvailability(unitId).then(setAvailability).catch(() => {});
  }, [unitId]);

  // Load held items when soldier is selected
  useEffect(() => {
    if (!useExisting || !selectedSoldier) { setHeldItems([]); return; }
    loadSoldierHeldItems(selectedSoldier.id).then(setHeldItems).catch(() => {});
  }, [selectedSoldier, useExisting]);

  // ── Soldier search ──────────────────────────────────────────────────────────

  function handleSearchChange(val: string) {
    setSoldierSearch(val);
    setSelectedSoldier(null);
    setUnitId(''); setTeamId('');
    setHeldItems([]); setEditMode(false);
    if (!val.trim()) { setSuggestions([]); setShowSugg(false); return; }
    const lower = val.toLowerCase();
    const matches = soldiers.filter(
      (s) => s.full_name.includes(val) || s.personal_number.includes(val) || s.full_name.toLowerCase().includes(lower)
    ).slice(0, 8);
    setSuggestions(matches);
    setShowSugg(true);
  }

  function selectSoldier(s: Soldier) {
    setSelectedSoldier(s);
    setSoldierSearch(`${s.full_name} (${s.personal_number})`);
    setShowSugg(false);
    setUnitId(s.unit_id);
    setTeamId(s.team_id ?? '');
    setEditForm({ phone: s.phone ?? '', unit_id: s.unit_id, team_id: s.team_id ?? '', busy: false });
    setEditMode(false);
  }

  async function saveEditSoldier() {
    if (!selectedSoldier) return;
    setEditForm((f) => ({ ...f, busy: true }));
    const { error } = await supabase.from('soldiers').update({
      phone:   editForm.phone.trim() || null,
      unit_id: editForm.unit_id || undefined,
      team_id: editForm.team_id || null,
    }).eq('id', selectedSoldier.id);
    if (error) { alert(error.message); setEditForm((f) => ({ ...f, busy: false })); return; }
    setSelectedSoldier({ ...selectedSoldier, phone: editForm.phone.trim() || null, unit_id: editForm.unit_id, team_id: editForm.team_id || null });
    setUnitId(editForm.unit_id);
    setTeamId(editForm.team_id);
    setEditMode(false);
    setEditForm((f) => ({ ...f, busy: false }));
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const teamsForNew  = useMemo(() => teams.filter((t) => t.unit_id === newUnitId), [teams, newUnitId]);
  const teamsForEdit = useMemo(() => teams.filter((t) => t.unit_id === editForm.unit_id), [teams, editForm.unit_id]);

  const availMap = useMemo(() => {
    const m = new Map<string, UnitAvailability>();
    for (const a of availability) m.set(a.itemId, a);
    return m;
  }, [availability]);

  const signingItems = useMemo(
    () => items.filter((it) => (availMap.get(it.id)?.available ?? 0) > 0),
    [items, availMap],
  );

  // ── Lines helpers ────────────────────────────────────────────────────────────

  function updateLine(idx: number, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine()              { setLines((prev) => [...prev, { itemId: '', quantity: 1, serialNumber: '' }]); }
  function removeLine(idx: number){ setLines((prev) => prev.filter((_, i) => i !== idx)); }

  // ── PDF (fire-and-forget → Google Drive) ──────────────────────────────────────
  // The signing sheet is the soldier's CURRENT radio inventory, stored at
  // קשר/<מסגרת>/החתמות/<שם>.pdf (overwritten each signing). Same Drive mechanism
  // the weapons module uses.

  async function fireSigningPdf(
    soldierId: string,
    soldier: { full_name: string; personal_number: string; phone?: string; unitName: string; teamName?: string },
    signaturePng: string,
  ) {
    const held = await loadSoldierHeldItems(soldierId); // radio items only (no PN)
    fireDrivePdf({
      title: 'החתמת ציוד קשר',
      note: 'סיכום נוכחי',
      entity: {
        full_name: soldier.full_name,
        personal_number: soldier.personal_number,
        phone: soldier.phone,
        unit_name: soldier.unitName,
        team_name: soldier.teamName,
      },
      items: held.map((h) => ({ name: h.itemName, quantity: h.quantity, serial: h.serialNumber })),
      performed_by: profile?.full_name ?? '',
      signature_png_b64: signaturePng,
      drive_path: ['קשר', soldier.unitName, 'החתמות'],
      filename: `${soldier.full_name}.pdf`,
    });
  }

  // ── Submit ───────────────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFeedback(null);
    if (!profile) return;

    // Validate soldier
    if (useExisting && !selectedSoldier) return setFeedback({ type: 'error', msg: 'בחר חייל מהרשימה' });
    if (!useExisting) {
      if (!newSoldier.full_name)                          return setFeedback({ type: 'error', msg: 'הזן שם חייל' });
      if (!/^\d{7}$/.test(newSoldier.personal_number))   return setFeedback({ type: 'error', msg: 'מספר אישי חייב להיות 7 ספרות בדיוק' });
      if (!/^05\d{8}$/.test(newSoldier.phone))           return setFeedback({ type: 'error', msg: 'טלפון חייב להיות מספר סלולרי ישראלי תקין (05XXXXXXXX)' });
      if (!newUnitId)                                     return setFeedback({ type: 'error', msg: 'בחר מסגרת' });
    }

    // Validate signature
    if (sigPadRef.current?.isEmpty()) return setFeedback({ type: 'error', msg: 'נא לחתום לפני השליחה' });

    // Validate items
    const valid = lines.filter((l) => l.itemId && l.quantity > 0);
    if (valid.length === 0) return setFeedback({ type: 'error', msg: 'הוסף לפחות פריט אחד' });

    for (const l of valid) {
      const a = availMap.get(l.itemId);
      if (!a) continue;
      if (!l.serialNumber && !a.hasBulk && a.serials.length > 0) {
        const name = items.find((i) => i.id === l.itemId)?.name ?? 'פריט';
        return setFeedback({ type: 'error', msg: `יש לבחור צ׳ עבור "${name}"` });
      }
      if (l.serialNumber) {
        const validSerials = new Set(a.serials.map((s) => s.serial));
        if (!validSerials.has(l.serialNumber.trim())) {
          const name = items.find((i) => i.id === l.itemId)?.name ?? 'פריט';
          return setFeedback({ type: 'error', msg: `הצ׳ "${l.serialNumber}" לא זמין עבור "${name}"` });
        }
      }
    }
    const serialKeys = valid.filter((l) => l.serialNumber).map((l) => `${l.itemId}::${l.serialNumber}`);
    const dupe = serialKeys.find((k, i) => serialKeys.indexOf(k) !== i);
    if (dupe) return setFeedback({ type: 'error', msg: 'בחרת את אותו צ׳ יותר מפעם אחת' });

    const totals = new Map<string, number>();
    for (const l of valid) totals.set(l.itemId, (totals.get(l.itemId) ?? 0) + l.quantity);
    for (const [itemId, qty] of totals) {
      const avail = availMap.get(itemId)?.available ?? 0;
      if (qty > avail) {
        const name = items.find((i) => i.id === itemId)?.name ?? 'פריט';
        return setFeedback({ type: 'error', msg: `חריגה ממלאי המסגרת עבור "${name}": מבוקש ${qty}, זמין ${avail}` });
      }
    }

    setSubmitting(true);
    try {
      let finalSoldierId = selectedSoldier?.id ?? '';
      const finalUnitId  = useExisting ? unitId  : newUnitId;
      const finalTeamId  = useExisting ? teamId  : newTeamId;

      // Create new soldier if needed
      if (!useExisting) {
        const { data: created, error: solErr } = await supabase
          .from('soldiers')
          .insert({ full_name: newSoldier.full_name, personal_number: newSoldier.personal_number, phone: newSoldier.phone, unit_id: finalUnitId, team_id: finalTeamId || null })
          .select().single();
        if (solErr) throw solErr;
        finalSoldierId = created.id;
      }

      // Create signing
      const { data: signing, error: sigErr } = await supabase
        .from('signings')
        .insert({ soldier_id: finalSoldierId, performed_by: profile.id, unit_id: finalUnitId, team_id: finalTeamId || null, type: 'signing', notes: notes || null })
        .select().single();
      if (sigErr) throw sigErr;

      const { error: itemsErr } = await supabase.from('signing_items').insert(
        valid.map((l) => ({ item_id: l.itemId, quantity: l.quantity, serial_number: l.serialNumber.trim() || null, signing_id: signing.id, action: 'issued' as const }))
      );
      if (itemsErr) throw itemsErr;

      // Bump "ירוק בעיניים" (green_check_at) for each serial handed over.
      // Best-effort, non-blocking: a green-check RLS edge case must never fail
      // an actual signing. Only existing item_serials rows are touched.
      const greenNow = new Date().toISOString();
      const serialLines = valid.filter((l) => l.serialNumber.trim());
      if (serialLines.length) {
        await Promise.all(serialLines.map((l) =>
          supabase.from('item_serials')
            .update({ green_check_at: greenNow })
            .eq('item_id', l.itemId)
            .eq('serial_number', l.serialNumber.trim()),
        )).catch(() => { /* secondary side-effect; ignore */ });
      }

      await logAudit({ action: 'signing.signing', targetType: 'signing', targetId: signing.id, details: { soldier_id: finalSoldierId, items: valid.length } });

      // Show success immediately
      setFeedback({ type: 'success', msg: 'נשמר בהצלחה' });

      // Fire PDF in background (no await) — to Drive at קשר/<מסגרת>/החתמות.
      const uName = units.find((u) => u.id === finalUnitId)?.name ?? '—';
      const tName = finalTeamId ? teams.find((t) => t.id === finalTeamId)?.name : undefined;
      const sFullName = useExisting ? (selectedSoldier?.full_name ?? '') : newSoldier.full_name;
      const sPN = useExisting ? (selectedSoldier?.personal_number ?? '') : newSoldier.personal_number;
      const sPhone = useExisting ? (selectedSoldier?.phone ?? undefined) : newSoldier.phone;
      void fireSigningPdf(
        finalSoldierId,
        { full_name: sFullName, personal_number: sPN, phone: sPhone, unitName: uName, teamName: tName },
        sigPadRef.current!.toDataUrl(),
      );

      // Reset
      setLines([{ itemId: '', quantity: 1, serialNumber: '' }]);
      setNotes('');
      setNewSoldier({ full_name: '', personal_number: '', phone: '' });
      sigPadRef.current?.clear();
      if (unitId) loadUnitAvailability(unitId).then(setAvailability).catch(() => {});
      if (selectedSoldier) loadSoldierHeldItems(selectedSoldier.id).then(setHeldItems).catch(() => {});
    } catch (err) {
      setFeedback({ type: 'error', msg: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">החתמת קשר - חיילים</h1>
        <p className="text-slate-500 text-sm mt-1">מבצע: {profile?.full_name}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── פרטי חייל ── */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-slate-700">פרטי חייל</h2>

          {/* Mode toggle */}
          <div className="flex gap-2">
            {(['existing', 'new'] as const).map((m) => (
              <button key={m} type="button"
                onClick={() => {
                  setUseExisting(m === 'existing');
                  setSelectedSoldier(null); setSoldierSearch('');
                  setUnitId(''); setTeamId(''); setHeldItems([]); setEditMode(false);
                }}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition ${
                  (useExisting ? 'existing' : 'new') === m
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                }`}>
                {m === 'existing' ? 'חייל קיים' : 'חייל חדש'}
              </button>
            ))}
          </div>

          {/* Existing soldier */}
          {useExisting && (
            <div className="space-y-3">
              <div ref={searchRef} className="relative">
                <label className="label">חיפוש לפי מספר אישי או שם</label>
                <input className="input" placeholder="הקלד שם או מ.א..." autoComplete="off"
                  value={soldierSearch}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSugg(true)} />
                {showSugg && suggestions.length > 0 && (
                  <ul className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-auto">
                    {suggestions.map((s) => (
                      <li key={s.id} onMouseDown={() => selectSoldier(s)}
                        className="flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0">
                        <div>
                          <span className="font-medium text-sm">{s.full_name}</span>
                          <span className="text-xs text-slate-500 mr-2">{s.personal_number}</span>
                        </div>
                        <span className="text-xs text-slate-400">{units.find((u) => u.id === s.unit_id)?.name ?? '—'}</span>
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
                      <span><span className="text-slate-500">מסגרת: </span>{units.find((u) => u.id === selectedSoldier.unit_id)?.name ?? '—'}</span>
                      {selectedSoldier.team_id && <span><span className="text-slate-500">צוות: </span>{teams.find((t) => t.id === selectedSoldier.team_id)?.name ?? '—'}</span>}
                    </div>
                    <button type="button" onClick={() => setEditMode(true)}
                      className="text-xs text-emerald-700 hover:text-emerald-900 shrink-0 mr-2">ערוך</button>
                  </div>
                </div>
              )}

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
                      <select className="input text-sm" value={editForm.team_id} disabled={!editForm.unit_id}
                        onChange={(e) => setEditForm((f) => ({ ...f, team_id: e.target.value }))}>
                        <option value="">בחר</option>
                        {teamsForEdit.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
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
          {!useExisting && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">מספר אישי *</label>
                <input className="input" inputMode="numeric" maxLength={7} placeholder="7 ספרות"
                  value={newSoldier.personal_number}
                  onChange={(e) => setNewSoldier((s) => ({ ...s, personal_number: e.target.value.replace(/\D/g, '') }))} required />
              </div>
              <div>
                <label className="label">שם מלא *</label>
                <input className="input" placeholder="שם פרטי ומשפחה"
                  value={newSoldier.full_name}
                  onChange={(e) => setNewSoldier((s) => ({ ...s, full_name: e.target.value }))} required />
              </div>
              <div>
                <label className="label">טלפון *</label>
                <input className="input" type="tel" placeholder="05X-XXXXXXX"
                  value={newSoldier.phone}
                  onChange={(e) => setNewSoldier((s) => ({ ...s, phone: e.target.value.replace(/\D/g, '') }))} required />
              </div>
              <div>
                <label className="label">מסגרת *</label>
                <select className="input" value={newUnitId}
                  onChange={(e) => { setNewUnitId(e.target.value); setNewTeamId(''); setUnitId(e.target.value); }} required>
                  <option value="">בחר מסגרת</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">צוות</label>
                <select className="input" value={newTeamId}
                  onChange={(e) => { setNewTeamId(e.target.value); setTeamId(e.target.value); }}
                  disabled={!newUnitId}>
                  <option value="">בחר צוות</option>
                  {teamsForNew.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* ── פריטים שכבר חתומים (מידע) ── */}
        {useExisting && selectedSoldier && heldItems.length > 0 && (
          <div className="card space-y-2">
            <h2 className="font-semibold text-slate-700 text-sm">פריטים שכבר חתומים על החייל</h2>
            <ul className="text-sm space-y-1">
              {heldItems.map((h) => (
                <li key={`${h.itemId}::${h.serialNumber ?? ''}`} className="flex justify-between text-slate-600">
                  <span>{h.itemName}{h.serialNumber ? ` — צ' ${h.serialNumber}` : ''}</span>
                  <span className="text-slate-400">×{h.quantity}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── פריטים ── */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-700">פריטים</h2>
            <button type="button" onClick={addLine} className="btn-secondary !py-1 !px-3 text-xs">+ הוסף פריט</button>
          </div>
          <div className="space-y-2">
            {lines.map((line, idx) => {
              const a              = line.itemId ? availMap.get(line.itemId) : null;
              const serials        = a?.serials ?? [];
              const takenSerials   = new Set(lines.filter((_, i) => i !== idx).filter((l) => l.itemId === line.itemId && l.serialNumber).map((l) => l.serialNumber));
              const visibleSerials = serials.filter((s) => !takenSerials.has(s.serial));
              const hasAnySerials  = serials.length > 0;
              const canBulk        = a?.hasBulk ?? false;
              const placeholder    = !line.itemId ? '—' : !hasAnySerials ? (canBulk ? 'ללא צ׳' : 'אין צ׳ים') : canBulk ? 'צ׳ (אופציונלי)' : 'חפש/בחר צ׳';

              return (
                <div key={idx} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-start border border-slate-200 rounded-lg p-2 sm:border-0 sm:p-0">
                  <select className="input flex-1" value={line.itemId}
                    onChange={(e) => updateLine(idx, { itemId: e.target.value, serialNumber: '', quantity: 1 })}>
                    <option value="">— בחר פריט —</option>
                    {signingItems.map((it) => {
                      const av = availMap.get(it.id);
                      return <option key={it.id} value={it.id}>{it.name}{av ? ` (זמין: ${av.available})` : ''}</option>;
                    })}
                    {signingItems.length === 0 && unitId && <option value="" disabled>אין פריטים זמינים למסגרת זו</option>}
                  </select>
                  <div className="flex gap-2">
                    <input
                      className="input flex-1 sm:w-40 sm:flex-none font-mono text-sm"
                      list={`serials-line-${idx}`}
                      value={line.serialNumber}
                      placeholder={placeholder}
                      disabled={!line.itemId || (!hasAnySerials && !canBulk)}
                      onChange={(e) => updateLine(idx, { serialNumber: e.target.value, quantity: e.target.value ? 1 : line.quantity })}
                    />
                    <datalist id={`serials-line-${idx}`}>
                      {visibleSerials.map((s) => <option key={s.serial} value={s.serial} />)}
                    </datalist>
                    <input type="number" min={1} className="input w-20"
                      value={line.quantity}
                      disabled={!!line.serialNumber}
                      onChange={(e) => updateLine(idx, { quantity: parseInt(e.target.value) || 1 })} />
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(idx)} className="btn-ghost text-red-600 !px-3">×</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── הערות ── */}
        <div className="card">
          <label className="label">הערות</label>
          <textarea className="input min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {/* ── חתימת החייל ── */}
        <div className="card space-y-3">
          <h2 className="font-semibold text-slate-700">חתימת החייל</h2>
          <SignaturePad ref={sigPadRef} />
        </div>

        {feedback && (
          <div className={`rounded-lg px-3 py-2 text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {feedback.msg}
          </div>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? 'שולח...' : 'שלח'}
        </button>
      </form>
    </div>
  );
}
