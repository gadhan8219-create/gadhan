import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { WeaponsItem } from '../../lib/database.types';

// ── Drive PDF helper ─────────────────────────────────────────────────────────

interface PdfCallArgs {
  title: string;
  note?: string;
  soldier: { full_name: string; personal_number: string; unit_name: string; phone?: string };
  items: Array<{ name: string; quantity: number; serial?: string | null }>;
  performed_by: string;
  drive_path: string[];
  filename: string;
}

async function callPdfFn(args: PdfCallArgs): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-weapon-checkout-pdf`;
  const resp = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token ?? ''}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ ...args, timestamp: new Date().toISOString() }),
  });
  const result = await resp.json();
  if (!result.ok) throw new Error(result.error ?? 'PDF generation failed');
  return result.url as string;
}

/** Trash an existing PDF in Drive (used on full return to drop the החתמות file). */
async function callDeletePdfFn(args: { drive_path: string[]; filename: string }): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-weapon-checkout-pdf`;
  const resp = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token ?? ''}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action: 'delete', ...args }),
  });
  const result = await resp.json();
  if (!result.ok) throw new Error(result.error ?? 'PDF delete failed');
}

/** Collapse weapons_returns rows into PDF line-items: serial items listed
 *  individually; non-serial (quantity) items grouped by name with a count. */
function buildItemsFromReturns(
  rows: Array<{ item_name: string | null; serial: string | null }>,
): Array<{ name: string; serial: string | null; quantity: number }> {
  const qtyMap = new Map<string, { name: string; serial: null; quantity: number }>();
  const out: Array<{ name: string; serial: string | null; quantity: number }> = [];
  for (const r of rows) {
    const name = r.item_name ?? '—';
    if (!r.serial) {
      const cur = qtyMap.get(name);
      if (cur) { cur.quantity++; }
      else { const o = { name, serial: null as null, quantity: 1 }; qtyMap.set(name, o); out.push(o); }
    } else {
      out.push({ name, serial: r.serial, quantity: 1 });
    }
  }
  return out;
}

interface ZikhuiPdfCtx {
  soldier: { full_name: string; personal_number: string; unit_name: string };
  credited_items: Array<{ name: string; serial: string | null; quantity: number }>;
  performed_by: string;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface SoldierRow {
  id: string;
  full_name: string;
  personal_number: string;
  unit_id: string;
  unit_name: string;
}

interface SerialRow {
  id: string;
  item_id: string;
  item_name: string;
  serial_number: string;
  assigned_to_pn: string;
  assigned_to_name: string | null;
  is_zeroed: boolean;
}

type MainTab = 'zikhui' | 'transfer' | 'rosh' | 'ipasoon';
type ZikhuiSub = 'soldier' | 'item';

// ── Soldier search component ──────────────────────────────────────────────────

function SoldierSearch({
  label, soldiers, selected, onSelect, onClear,
}: {
  label: string;
  soldiers: SoldierRow[];
  selected: SoldierRow | null;
  onSelect: (s: SoldierRow) => void;
  onClear: () => void;
}) {
  const [query, setQuery]   = useState('');
  const [show,  setShow]    = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const lower = query.toLowerCase();
  const suggestions = query.trim()
    ? soldiers.filter(
        (s) => s.full_name.includes(query) || s.personal_number.includes(query) || s.full_name.toLowerCase().includes(lower)
      ).slice(0, 8)
    : [];

  function handleClear() { setQuery(''); setShow(false); onClear(); }

  return (
    <div ref={ref} className="relative">
      <label className="label">{label}</label>
      <div className="relative">
        <input
          className="input pr-8"
          placeholder="הקלד שם או מ.א..."
          autoComplete="off"
          value={selected ? `${selected.full_name} (${selected.personal_number})` : query}
          readOnly={!!selected}
          onChange={(e) => { setQuery(e.target.value); setShow(true); }}
          onFocus={() => { if (!selected) setShow(true); }}
          onClick={() => { if (selected) handleClear(); }}
        />
        {selected && (
          <button type="button" onClick={handleClear}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-lg leading-none">×</button>
        )}
      </div>
      {selected && (
        <p className="text-xs text-slate-400 mt-0.5">{selected.unit_name}</p>
      )}
      {show && suggestions.length > 0 && !selected && (
        <ul className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-auto">
          {suggestions.map((s) => (
            <li key={s.id} onMouseDown={() => { onSelect(s); setQuery(''); setShow(false); }}
              className="flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0">
              <span className="font-medium text-sm">{s.full_name}
                <span className="text-xs text-slate-500 mr-2">{s.personal_number}</span>
              </span>
              <span className="text-xs text-slate-400">{s.unit_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WeaponsTransferPage() {
  const { profile } = useAuth();

  const [soldiers,   setSoldiers]   = useState<SoldierRow[]>([]);
  const [items,      setItems]      = useState<WeaponsItem[]>([]);
  const [allSerials, setAllSerials] = useState<SerialRow[]>([]);

  const [tab,       setTab]       = useState<MainTab>('zikhui');
  const [zikhuiSub, setZikhuiSub] = useState<ZikhuiSub>('soldier');

  const [srcSoldier, setSrcSoldier] = useState<SoldierRow | null>(null);
  const [dstSoldier, setDstSoldier] = useState<SoldierRow | null>(null);

  // Zikhui by item
  const [zItemId,  setZItemId]  = useState('');
  const [zSerialQ, setZSerialQ] = useState('');
  const [zSerial,  setZSerial]  = useState('');

  const [checked, setChecked] = useState<Set<string>>(new Set());
  // איפסון: optional per-item note (e.g. בטחונית צוות), keyed by serial_number.
  const [zeroNotes, setZeroNotes] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  async function loadAll() {
    const [sol, wi, ser] = await Promise.all([
      supabase.from('soldiers').select('*, units(name)').order('full_name'),
      supabase.from('weapons_items').select('*').eq('active', true).order('name'),
      supabase
        .from('weapons_item_serials')
        .select('id, item_id, serial_number, assigned_to_pn, assigned_to_name, is_zeroed, weapons_items(name)')
        .not('assigned_to_pn', 'is', null),
    ]);
    if (sol.data) {
      setSoldiers(sol.data.map((s: any) => ({
        id: s.id, full_name: s.full_name, personal_number: s.personal_number,
        unit_id: s.unit_id, unit_name: s.units?.name ?? '—',
      })));
    }
    if (wi.data) setItems(wi.data);
    if (ser.data) {
      setAllSerials((ser.data as any[]).map((r) => ({
        id: r.id, item_id: r.item_id, item_name: r.weapons_items?.name ?? '—',
        serial_number: r.serial_number, assigned_to_pn: r.assigned_to_pn,
        assigned_to_name: r.assigned_to_name, is_zeroed: r.is_zeroed ?? false,
      })));
    }
  }
  useEffect(() => { loadAll(); }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Synthetic serial inserted for non-serial (quantity) items. Hide from UI. */
  const isQtySerial = (s: string) => s.startsWith('__qty__');

  function resetForms() {
    setSrcSoldier(null); setDstSoldier(null);
    setZItemId(''); setZSerialQ(''); setZSerial('');
    setChecked(new Set());
    setZeroNotes({});
    setSuccess(null); setError(null);
  }

  function toggleCheck(key: string) {
    setChecked((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  const srcSerials = srcSoldier ? allSerials.filter((r) => r.assigned_to_pn === srcSoldier.personal_number) : [];
  const dstSerials = dstSoldier ? allSerials.filter((r) => r.assigned_to_pn === dstSoldier.personal_number) : [];

  // ── Actions ───────────────────────────────────────────────────────────────

  /**
   * Regenerate (or delete) a soldier's החתמות sheet to match their CURRENT
   * holdings. Fire-and-forget. Used after any action that changes what a soldier
   * holds — זיכוי, העברה and ראש בראש — so the Drive form always matches reality.
   * Must be called AFTER the DB write so the query reflects the new state.
   */
  function fireHoldingsPdf(soldier: { full_name: string; personal_number: string; unit_name: string }) {
    (async () => {
      const { data: remaining } = await supabase
        .from('weapons_item_serials')
        .select('serial_number, weapons_items(name)')
        .eq('assigned_to_pn', soldier.personal_number)
        .not('assigned_to_pn', 'is', null);
      const filename = `${soldier.full_name}.pdf`;
      const drive_path = ['נשקיה', soldier.unit_name, 'החתמות'];
      const rows = (remaining ?? []) as any[];
      if (rows.length === 0) {
        // No items left → remove the stale sheet.
        await callDeletePdfFn({ drive_path, filename });
        return;
      }
      // Real serials listed individually; qty items collapsed into a count.
      const qtyMap = new Map<string, { name: string; quantity: number }>();
      const items: Array<{ name: string; serial: string | null; quantity: number }> = [];
      for (const r of rows) {
        const name = r.weapons_items?.name ?? '—';
        if (isQtySerial(r.serial_number)) {
          const cur = qtyMap.get(name);
          if (cur) cur.quantity += 1; else qtyMap.set(name, { name, quantity: 1 });
        } else {
          items.push({ name, serial: r.serial_number, quantity: 1 });
        }
      }
      for (const v of qtyMap.values()) items.push({ name: v.name, serial: null, quantity: v.quantity });
      await callPdfFn({
        title:      'סיכום נשק בהחזקה',
        note:       `עודכן · ${new Date().toLocaleDateString('he-IL')}`,
        soldier,
        items,
        performed_by: profile?.full_name ?? '',
        drive_path,
        filename,
      });
    })().catch(() => { /* error email sent by backend */ });
  }

  async function doZikhui(ids: string[], pdfCtx?: ZikhuiPdfCtx) {
    if (!ids.length) { setError('לא נבחרו פריטים'); return; }
    setLoading(true); setError(null);
    try {
      // 1. Record the returns BEFORE clearing — weapons_returns is the cumulative
      //    source of truth for the זיכויים PDF (clearing assigned_to_pn erases
      //    the only trace that the soldier ever held these items).
      if (pdfCtx) {
        const { soldier, credited_items } = pdfCtx;
        const { error: retErr } = await supabase.from('weapons_returns').insert(
          credited_items.map((it) => ({
            soldier_pn:   soldier.personal_number,
            soldier_name: soldier.full_name,
            unit_name:    soldier.unit_name,
            item_name:    it.name,
            serial:       it.serial,
            performed_by: profile?.id ?? null,
          })),
        );
        if (retErr) throw new Error(`רישום הזיכוי נכשל — ${retErr.message} (ייתכן שאין הרשאה למסגרת זו)`);
      }

      // 2. Clear assignments in DB — surface RLS no-ops (0 rows + no error)
      const now = new Date().toISOString();
      const { data: cleared, error: clrErr } = await supabase.from('weapons_item_serials')
        .update({ assigned_to_pn: null, assigned_to_name: null, assigned_at: null, is_zeroed: false, green_check_at: now })
        .in('id', ids)
        .select('id');
      if (clrErr) throw new Error(clrErr.message);
      if (!cleared || cleared.length < ids.length) {
        throw new Error('לא ניתן לזכות חלק מהפריטים — ייתכן שאין הרשאה למסגרת זו');
      }

      // 3. Show success immediately — PDFs fire in background
      setSuccess(`${ids.length} פריטים הוחזרו לגדוד`);
      await loadAll();
      resetForms();

      // 4. Fire PDFs in background (no await) — error email sent by backend if they fail
      if (pdfCtx) {
        const { soldier, performed_by } = pdfCtx;
        const filename = `${soldier.full_name}.pdf`;
        const dateStr  = new Date().toLocaleDateString('he-IL');

        // 4a. זיכויים PDF — CUMULATIVE: every item this soldier has ever returned.
        (async () => {
          const { data: allReturns } = await supabase
            .from('weapons_returns')
            .select('item_name, serial')
            .eq('soldier_pn', soldier.personal_number)
            .order('returned_at');
          await callPdfFn({
            title:      'זיכוי נשק',
            note:       `מצטבר · ${dateStr}`,
            soldier,
            items:      buildItemsFromReturns(allReturns ?? []),
            performed_by,
            drive_path: ['נשקיה', soldier.unit_name, 'זיכויים'],
            filename,
          });
        })().catch(() => { /* error email sent by backend */ });

        // 4b. החתמות PDF — remaining holdings, or DELETE the file on full return.
        fireHoldingsPdf(soldier);
      }
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  async function doTransfer() {
    if (!srcSoldier || !dstSoldier) { setError('בחר חייל מקור ויעד'); return; }
    if (srcSoldier.unit_id !== dstSoldier.unit_id) { setError('לא ניתן להעביר בין מסגרות שונות'); return; }
    if (!checked.size) { setError('לא נבחרו פריטים'); return; }
    const rows = srcSerials.filter((r) => checked.has(r.serial_number) && !r.is_zeroed);
    if (!rows.length) { setError('פריט מאופסן ניתן לזיכוי בלבד'); return; }
    const dstItemIds = new Set(dstSerials.map((r) => r.item_id));
    const conflict = rows.find((r) => dstItemIds.has(r.item_id));
    if (conflict) { setError(`חייל היעד כבר מחזיק: ${conflict.item_name}`); return; }
    setLoading(true); setError(null);
    try {
      const now = new Date().toISOString();
      const { data: moved, error: mvErr } = await supabase.from('weapons_item_serials')
        .update({ assigned_to_pn: dstSoldier.personal_number, assigned_to_name: dstSoldier.full_name, assigned_at: now, green_check_at: now })
        .in('id', rows.map((r) => r.id))
        .select('id');
      if (mvErr) throw new Error(mvErr.message);
      if (!moved || moved.length < rows.length) {
        throw new Error('לא ניתן להעביר חלק מהפריטים — ייתכן שאין הרשאה למסגרת זו');
      }
      setSuccess(`${rows.length} פריטים הועברו ל-${dstSoldier.full_name}`);
      // Both soldiers' holdings changed → refresh their החתמות sheets.
      fireHoldingsPdf({ full_name: srcSoldier.full_name, personal_number: srcSoldier.personal_number, unit_name: srcSoldier.unit_name });
      fireHoldingsPdf({ full_name: dstSoldier.full_name, personal_number: dstSoldier.personal_number, unit_name: dstSoldier.unit_name });
      await loadAll(); resetForms();
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  const roshOverlap = srcSoldier && dstSoldier
    ? (() => {
        // Exclude qty-only synthetic serials — ראש בראש only applies to real serial items.
        // Also exclude מאופסן items — a zeroed weapon can only be credited (זיכוי).
        const sm: Record<string, SerialRow> = {};
        for (const r of srcSerials) if (!isQtySerial(r.serial_number) && !r.is_zeroed) sm[r.item_id] = r;
        const dm: Record<string, SerialRow> = {};
        for (const r of dstSerials) if (!isQtySerial(r.serial_number) && !r.is_zeroed) dm[r.item_id] = r;
        return Object.keys(sm).filter((id) => dm[id])
          .map((id) => ({ itemId: id, itemName: sm[id].item_name, srcRow: sm[id], dstRow: dm[id] }));
      })()
    : [];

  async function doRosh() {
    if (!srcSoldier || !dstSoldier) { setError('בחר שני חיילים'); return; }
    if (srcSoldier.unit_id !== dstSoldier.unit_id) { setError('לא ניתן לבצע ראש בראש בין מסגרות שונות'); return; }
    const toSwap = roshOverlap.filter((o) => checked.has(o.itemId));
    if (!toSwap.length) { setError('לא נבחרו פריטים'); return; }
    setLoading(true); setError(null);
    try {
      const now = new Date().toISOString();
      for (const p of toSwap) {
        const { data: a, error: aErr } = await supabase.from('weapons_item_serials')
          .update({ assigned_to_pn: dstSoldier.personal_number, assigned_to_name: dstSoldier.full_name, assigned_at: now, green_check_at: now })
          .eq('id', p.srcRow.id)
          .select('id');
        if (aErr) throw new Error(aErr.message);
        if (!a || a.length === 0) throw new Error(`לא ניתן לבצע ראש בראש על ${p.itemName} — ייתכן שאין הרשאה למסגרת זו`);
        const { data: b, error: bErr } = await supabase.from('weapons_item_serials')
          .update({ assigned_to_pn: srcSoldier.personal_number, assigned_to_name: srcSoldier.full_name, assigned_at: now, green_check_at: now })
          .eq('id', p.dstRow.id)
          .select('id');
        if (bErr) throw new Error(bErr.message);
        if (!b || b.length === 0) throw new Error(`לא ניתן לבצע ראש בראש על ${p.itemName} — ייתכן שאין הרשאה למסגרת זו`);
      }
      setSuccess(`ראש בראש בוצע ל-${toSwap.length} פריטים`);
      // Both soldiers swapped items → refresh both החתמות sheets.
      fireHoldingsPdf({ full_name: srcSoldier.full_name, personal_number: srcSoldier.personal_number, unit_name: srcSoldier.unit_name });
      fireHoldingsPdf({ full_name: dstSoldier.full_name, personal_number: dstSoldier.personal_number, unit_name: dstSoldier.unit_name });
      await loadAll(); resetForms();
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  async function doIpasoon() {
    const rows = srcSerials.filter((r) => checked.has(r.serial_number) && !r.is_zeroed);
    if (!rows.length) { setError('לא נבחרו פריטים'); return; }
    setLoading(true); setError(null);
    try {
      const now = new Date().toISOString();
      // Per-item note (e.g. בטחונית צוות) → update each row with its own note.
      for (const r of rows) {
        const note = zeroNotes[r.serial_number]?.trim() || null;
        const { error } = await supabase.from('weapons_item_serials')
          .update({ is_zeroed: true, zeroed_at: now, zeroed_note: note, green_check_at: now })
          .eq('id', r.id);
        if (error) throw new Error(error.message);
      }
      setSuccess(`${rows.length} פריטים אופסנו אצל ${srcSoldier?.full_name}`);
      await loadAll(); resetForms();
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  /** Remove an already-zeroed item from איפסון (clears the flag). Item stays signed. */
  async function doUnipasoon(id: string) {
    setLoading(true); setError(null);
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase.from('weapons_item_serials')
        .update({ is_zeroed: false, zeroed_at: null, zeroed_note: null, green_check_at: now })
        .eq('id', id)
        .select('id');
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        throw new Error('לא ניתן להוציא מאיפסון — ייתכן שאין הרשאה למסגרת זו');
      }
      setSuccess('הפריט הוצא מאיפסון');
      await loadAll();
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const TABS: { key: MainTab; label: string }[] = [
    { key: 'zikhui',   label: 'זיכוי'     },
    { key: 'transfer', label: 'העברה'      },
    { key: 'rosh',     label: 'ראש בראש'  },
    { key: 'ipasoon',  label: 'איפסון'    },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">העברה / זיכוי</h1>
        <p className="text-slate-500 text-sm mt-1">מבצע: {profile?.full_name}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {TABS.map((t) => (
          <button key={t.key} type="button"
            onClick={() => { setTab(t.key); resetForms(); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              tab === t.key ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Feedback */}
      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-emerald-800 text-sm flex justify-between">
          {success}
          <button onClick={() => setSuccess(null)} className="text-emerald-600 hover:text-emerald-900 ml-2">×</button>
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 ml-2">×</button>
        </div>
      )}

      {/* ── זיכוי ── */}
      {tab === 'zikhui' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(['soldier','item'] as ZikhuiSub[]).map((k) => (
              <button key={k} type="button"
                onClick={() => { setZikhuiSub(k); resetForms(); }}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition ${
                  zikhuiSub === k ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300'
                }`}>
                {k === 'soldier' ? 'זיכוי חייל' : 'זיכוי לפי פריט'}
              </button>
            ))}
          </div>

          {zikhuiSub === 'soldier' && (
            <div className="card space-y-4">
              <SoldierSearch label="חייל לזיכוי" soldiers={soldiers} selected={srcSoldier}
                onSelect={(s) => { setSrcSoldier(s); setChecked(new Set()); }}
                onClear={() => { setSrcSoldier(null); setChecked(new Set()); }} />
              {srcSoldier && srcSerials.length === 0 && (
                <p className="text-sm text-slate-400">אין פריטים חתומים</p>
              )}
              {srcSerials.length > 0 && (
                <>
                  <div className="space-y-2">
                    {srcSerials.map((r) => (
                      <label key={r.serial_number}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                          checked.has(r.serial_number) ? 'border-red-300 bg-red-50' : 'border-slate-200 hover:border-slate-300'
                        }`}>
                        <input type="checkbox" className="accent-red-600 w-4 h-4"
                          checked={checked.has(r.serial_number)} onChange={() => toggleCheck(r.serial_number)} />
                        <span className="flex-1 text-sm font-medium">{r.item_name}</span>
                        {!isQtySerial(r.serial_number) && (
                          <span className="font-mono text-xs text-slate-500" dir="ltr">{r.serial_number}</span>
                        )}
                        {r.is_zeroed && <span className="badge bg-orange-100 text-orange-700 text-xs">מאופסן</span>}
                      </label>
                    ))}
                  </div>
                  <button type="button" disabled={loading || !checked.size}
                    onClick={() => {
                      const toCredit = srcSerials.filter((r) => checked.has(r.serial_number));
                      doZikhui(
                        toCredit.map((r) => r.id),
                        srcSoldier ? {
                          soldier: { full_name: srcSoldier.full_name, personal_number: srcSoldier.personal_number, unit_name: srcSoldier.unit_name },
                          credited_items: toCredit.map((r) => ({ name: r.item_name, serial: isQtySerial(r.serial_number) ? null : r.serial_number, quantity: 1 })),
                          performed_by: profile?.full_name ?? '',
                        } : undefined,
                      );
                    }}
                    className="btn-danger w-full disabled:opacity-50">
                    {loading ? 'מזכה...' : `זכה ${checked.size ? checked.size + ' פריטים' : ''}`}
                  </button>
                </>
              )}
            </div>
          )}

          {zikhuiSub === 'item' && (
            <div className="card space-y-4">
              <div>
                <label className="label">בחר פריט</label>
                <select className="input" value={zItemId}
                  onChange={(e) => { setZItemId(e.target.value); setZSerial(''); setZSerialQ(''); }}>
                  <option value="">-- בחר פריט --</option>
                  {items.filter((i) => i.has_serials).map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </div>
              {zItemId && (() => {
                const list = allSerials.filter((r) => r.item_id === zItemId);
                const filtered = list.filter((r) =>
                  !zSerialQ || r.serial_number.includes(zSerialQ) ||
                  (r.assigned_to_name ?? '').includes(zSerialQ) || r.assigned_to_pn.includes(zSerialQ)
                );
                return (
                  <>
                    <input className="input font-mono text-sm" dir="ltr" placeholder="חיפוש צ׳ / שם..."
                      value={zSerialQ} onChange={(e) => setZSerialQ(e.target.value)} />
                    <div className="space-y-2 max-h-64 overflow-auto">
                      {filtered.length === 0 && <p className="text-sm text-slate-400 text-center py-2">אין תוצאות</p>}
                      {filtered.map((r) => (
                        <label key={r.serial_number}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                            zSerial === r.serial_number ? 'border-red-300 bg-red-50' : 'border-slate-200 hover:border-slate-300'
                          }`}>
                          <input type="radio" className="accent-red-600 w-4 h-4"
                            checked={zSerial === r.serial_number} onChange={() => setZSerial(r.serial_number)} />
                          <span className="font-mono text-sm" dir="ltr">{r.serial_number}</span>
                          <span className="flex-1 text-sm text-slate-500">{r.assigned_to_name ?? r.assigned_to_pn}</span>
                          {r.is_zeroed && <span className="badge bg-orange-100 text-orange-700 text-xs">מאופסן</span>}
                        </label>
                      ))}
                    </div>
                    {zSerial && (
                      <button type="button" disabled={loading}
                        onClick={() => {
                          const row = allSerials.find((r) => r.item_id === zItemId && r.serial_number === zSerial);
                          if (!row) return;
                          const soldierRow = soldiers.find((s) => s.personal_number === row.assigned_to_pn);
                          doZikhui(
                            [row.id],
                            soldierRow ? {
                              soldier: { full_name: soldierRow.full_name, personal_number: soldierRow.personal_number, unit_name: soldierRow.unit_name },
                              credited_items: [{ name: row.item_name, serial: row.serial_number, quantity: 1 }],
                              performed_by: profile?.full_name ?? '',
                            } : undefined,
                          );
                        }}
                        className="btn-danger w-full disabled:opacity-50">
                        {loading ? 'מזכה...' : `זכה צ׳ ${zSerial}`}
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── העברה ── */}
      {tab === 'transfer' && (
        <div className="card space-y-4">
          <SoldierSearch label="חייל מקור" soldiers={soldiers} selected={srcSoldier}
            onSelect={(s) => { setSrcSoldier(s); setChecked(new Set()); }}
            onClear={() => { setSrcSoldier(null); setChecked(new Set()); }} />
          {srcSoldier && srcSerials.length === 0 && <p className="text-sm text-slate-400">אין פריטים חתומים</p>}
          {srcSerials.length > 0 && (
            <div className="space-y-2">
              {srcSerials.map((r) => {
                const atDst = dstSoldier ? dstSerials.some((d) => d.item_id === r.item_id) : false;
                const blocked = atDst || r.is_zeroed;
                return (
                  <label key={r.serial_number}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition ${
                      blocked ? 'opacity-40 cursor-not-allowed border-slate-200' :
                      checked.has(r.serial_number) ? 'border-emerald-400 bg-emerald-50 cursor-pointer' : 'border-slate-200 hover:border-slate-300 cursor-pointer'
                    }`}>
                    <input type="checkbox" className="accent-emerald-600 w-4 h-4"
                      checked={checked.has(r.serial_number)} disabled={blocked}
                      onChange={() => toggleCheck(r.serial_number)} />
                    <span className="flex-1 text-sm font-medium">{r.item_name}</span>
                    {!isQtySerial(r.serial_number) && (
                      <span className="font-mono text-xs text-slate-500" dir="ltr">{r.serial_number}</span>
                    )}
                    {r.is_zeroed && <span className="text-xs text-orange-600">מאופסן — רק זיכוי</span>}
                    {atDst && !r.is_zeroed && <span className="text-xs text-slate-400">כבר ביעד</span>}
                  </label>
                );
              })}
            </div>
          )}
          <SoldierSearch label="חייל יעד" soldiers={soldiers.filter((s) => s.id !== srcSoldier?.id)}
            selected={dstSoldier}
            onSelect={setDstSoldier}
            onClear={() => setDstSoldier(null)} />
          {srcSoldier && dstSoldier && srcSoldier.unit_id !== dstSoldier.unit_id && (
            <p className="text-sm text-red-600">החיילים ממסגרות שונות — העברה לא מותרת</p>
          )}
          {srcSoldier && dstSoldier && srcSoldier.unit_id === dstSoldier.unit_id && (
            <button type="button" disabled={loading || !checked.size} onClick={doTransfer}
              className="btn-primary w-full disabled:opacity-50">
              {loading ? 'מעביר...' : `העבר ${checked.size ? checked.size + ' פריטים' : ''} → ${dstSoldier.full_name}`}
            </button>
          )}
        </div>
      )}

      {/* ── ראש בראש ── */}
      {tab === 'rosh' && (
        <div className="card space-y-4">
          <SoldierSearch label="חייל א׳" soldiers={soldiers} selected={srcSoldier}
            onSelect={(s) => { setSrcSoldier(s); setChecked(new Set()); }}
            onClear={() => { setSrcSoldier(null); setChecked(new Set()); }} />
          <SoldierSearch label="חייל ב׳" soldiers={soldiers.filter((s) => s.id !== srcSoldier?.id)}
            selected={dstSoldier}
            onSelect={(s) => { setDstSoldier(s); setChecked(new Set()); }}
            onClear={() => { setDstSoldier(null); setChecked(new Set()); }} />
          {srcSoldier && dstSoldier && srcSoldier.unit_id !== dstSoldier.unit_id && (
            <p className="text-sm text-red-600">החיילים ממסגרות שונות — ראש בראש לא מותר</p>
          )}
          {srcSoldier && dstSoldier && srcSoldier.unit_id === dstSoldier.unit_id && (
            roshOverlap.length === 0
              ? <p className="text-sm text-slate-400 text-center py-2">אין פריטים חופפים</p>
              : (
                <>
                  <div className="space-y-2">
                    {roshOverlap.map((o) => (
                      <label key={o.itemId}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                          checked.has(o.itemId) ? 'border-teal-400 bg-teal-50' : 'border-slate-200 hover:border-slate-300'
                        }`}>
                        <input type="checkbox" className="accent-teal-600 w-4 h-4"
                          checked={checked.has(o.itemId)} onChange={() => toggleCheck(o.itemId)} />
                        <span className="flex-1 text-sm font-medium">{o.itemName}</span>
                        <span className="text-xs text-slate-500 font-mono" dir="ltr">
                          {isQtySerial(o.srcRow.serial_number) ? '—' : o.srcRow.serial_number} ⇄ {isQtySerial(o.dstRow.serial_number) ? '—' : o.dstRow.serial_number}
                        </span>
                      </label>
                    ))}
                  </div>
                  <button type="button" disabled={loading || !checked.size} onClick={doRosh}
                    className="btn-primary w-full !bg-teal-600 hover:!bg-teal-700 disabled:opacity-50">
                    {loading ? 'מבצע...' : `ראש בראש — ${checked.size || ''} פריטים`}
                  </button>
                </>
              )
          )}
        </div>
      )}

      {/* ── איפסון ── */}
      {tab === 'ipasoon' && (
        <div className="card space-y-4">
          <p className="text-sm text-slate-500">
            איפסון — הפריט נשאר חתום אצל החייל אך מסומן כמאופסן למעקב.
          </p>
          <SoldierSearch label="חייל לאיפסון" soldiers={soldiers} selected={srcSoldier}
            onSelect={(s) => { setSrcSoldier(s); setChecked(new Set()); }}
            onClear={() => { setSrcSoldier(null); setChecked(new Set()); }} />
          {srcSoldier && srcSerials.length === 0 && <p className="text-sm text-slate-400">אין פריטים חתומים</p>}
          {srcSerials.length > 0 && (
            <>
              <div className="space-y-2">
                {srcSerials.map((r) => {
                  const isReal = !isQtySerial(r.serial_number);
                  const isChecked = checked.has(r.serial_number);
                  return (
                    <div key={r.serial_number}
                      className={`rounded-lg border transition ${
                        r.is_zeroed ? 'border-orange-200 bg-orange-50' :
                        isChecked ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-slate-300'
                      }`}>
                      <label className={`flex items-center gap-3 p-3 ${r.is_zeroed ? 'cursor-default' : 'cursor-pointer'}`}>
                        <input type="checkbox" className="accent-orange-500 w-4 h-4"
                          checked={isChecked} disabled={r.is_zeroed}
                          onChange={() => toggleCheck(r.serial_number)} />
                        <span className="flex-1 text-sm font-medium">{r.item_name}</span>
                        {isReal && (
                          <span className="font-mono text-xs text-slate-500" dir="ltr">{r.serial_number}</span>
                        )}
                        {r.is_zeroed && <span className="badge bg-orange-100 text-orange-700 text-xs">מאופסן</span>}
                        {r.is_zeroed && (
                          <button type="button" disabled={loading}
                            onClick={() => doUnipasoon(r.id)}
                            className="text-xs font-medium text-orange-700 hover:text-orange-900 disabled:opacity-50 whitespace-nowrap">
                            הוצא מאיפסון
                          </button>
                        )}
                      </label>
                      {isChecked && !r.is_zeroed && (
                        <div className="px-3 pb-3">
                          <input
                            className="input text-sm"
                            placeholder="בטחונית צוות"
                            value={zeroNotes[r.serial_number] ?? ''}
                            onChange={(e) => setZeroNotes((p) => ({ ...p, [r.serial_number]: e.target.value }))}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <button type="button" disabled={loading || !checked.size} onClick={doIpasoon}
                className="btn-primary w-full !bg-orange-500 hover:!bg-orange-600 disabled:opacity-50">
                {loading ? 'מאפסן...' : `אפסן ${checked.size ? checked.size + ' פריטים' : ''}`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
