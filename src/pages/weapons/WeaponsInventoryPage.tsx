import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { WeaponsItem } from '../../lib/database.types';

type View = 'qty' | 'serial';

interface UnitRow   { id: string; name: string; }
interface SerialRow {
  id: string;
  item_id: string;
  serial_number: string;
  assigned_to_pn:   string;
  assigned_to_name: string | null;
  weapon_check_at:  string | null;
  green_check_at:   string | null;
  unit_id: string | null; // resolved from soldiers
}

interface DetailModal {
  itemId:   string;
  itemName: string;
  unitId:   string;
  unitName: string;
  rows: SerialRow[];
}

// Synthetic serial assigned to non-serial (quantity-tracked) items. These have
// no real צ׳ — they should be displayed as a count, never as the raw serial.
const isQtySerial = (s: string) => s.startsWith('__qty__');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
type CheckStatus = 'exempt' | 'due' | 'ok';
function checkStatus(dateStr: string | null, exempt: boolean): CheckStatus {
  if (exempt) return 'exempt';
  if (!dateStr) return 'due';
  return Date.now() - new Date(dateStr).getTime() > WEEK_MS ? 'due' : 'ok';
}

export default function WeaponsInventoryPage() {
  const { profile } = useAuth();
  const isAdmin  = profile?.role === 'admin';
  const isRaspar = profile?.role === 'raspar';
  const raspUnitId = profile?.unit_id ?? null;

  const [view, setView] = useState<View>('qty');

  const [items,      setItems]      = useState<WeaponsItem[]>([]);
  const [units,      setUnits]      = useState<UnitRow[]>([]);
  const [serials,    setSerials]    = useState<SerialRow[]>([]);
  // total serials per item (regardless of assignment)
  const [totalCounts, setTotalCounts] = useState<Record<string, number>>({});
  // issued counts: pivot[itemId][unitId]
  const [counts,     setCounts]     = useState<Record<string, Record<string, number>>>({});
  const [loading,    setLoading]    = useState(true);

  // Filters (qty view)
  const [itemSearch,    setItemSearch]    = useState('');
  const [pinnedItems,   setPinnedItems]   = useState<Set<string>>(new Set());
  const [serialSearch,  setSerialSearch]  = useState('');

  // Filters (serial view)
  const [serialQuery, setSerialQuery] = useState('');
  const [sortDue,     setSortDue]     = useState(false);

  // Detail modal
  const [detail, setDetail] = useState<DetailModal | null>(null);

  async function load() {
    setLoading(true);
    const [wi, un, allSer, assigned, sol] = await Promise.all([
      supabase.from('weapons_items').select('*').eq('active', true).order('name'),
      supabase.from('units').select('id, name').order('name'),
      // total serials per item
      supabase.from('weapons_item_serials').select('item_id'),
      // assigned serials with details
      supabase
        .from('weapons_item_serials')
        .select('id, item_id, serial_number, assigned_to_pn, assigned_to_name, weapon_check_at, green_check_at')
        .not('assigned_to_pn', 'is', null),
      supabase.from('soldiers').select('personal_number, unit_id'),
    ]);

    if (wi.data) setItems(wi.data);
    if (un.data) setUnits(un.data);

    // total serials per item
    const totals: Record<string, number> = {};
    for (const r of (allSer.data ?? []) as Array<{ item_id: string }>) {
      totals[r.item_id] = (totals[r.item_id] ?? 0) + 1;
    }
    setTotalCounts(totals);

    // pn → unit_id
    const pnToUnit: Record<string, string> = {};
    for (const s of (sol.data ?? []) as Array<{ personal_number: string; unit_id: string }>) {
      pnToUnit[s.personal_number] = s.unit_id;
    }

    // Enrich assigned serials with unit_id
    const enriched: SerialRow[] = ((assigned.data ?? []) as Array<{
      id: string; item_id: string; serial_number: string;
      assigned_to_pn: string; assigned_to_name: string | null;
      weapon_check_at: string | null; green_check_at: string | null;
    }>).map((r) => ({
      ...r,
      unit_id: pnToUnit[r.assigned_to_pn] ?? null,
    }));
    setSerials(enriched);

    // Pivot: itemId × unitId = count
    const pivot: Record<string, Record<string, number>> = {};
    for (const r of enriched) {
      if (!r.unit_id) continue;
      if (!pivot[r.item_id]) pivot[r.item_id] = {};
      pivot[r.item_id][r.unit_id] = (pivot[r.item_id][r.unit_id] ?? 0) + 1;
    }
    setCounts(pivot);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────

  function totalIssued(itemId: string) {
    return Object.values(counts[itemId] ?? {}).reduce((s, n) => s + n, 0);
  }
  function unitTotal(unitId: string) {
    return items.reduce((s, i) => s + (counts[i.id]?.[unitId] ?? 0), 0);
  }
  function stockFor(item: WeaponsItem) {
    // For non-serial items, quantity = total stock; subtract rows assigned in weapons_item_serials
    if (!item.has_serials) return (item.quantity ?? 0) - totalIssued(item.id);
    return (totalCounts[item.id] ?? 0) - totalIssued(item.id);
  }

  // Can the current user mark checks on a serial sitting at the given unit?
  function canMark(unitId: string | null) {
    return isAdmin || (isRaspar && unitId != null && unitId === raspUnitId);
  }

  // Marks every passed serial id as checked now. For quantity-tracked items a
  // single display row represents many synthetic serials, so we update them all.
  async function markCheck(ids: string[], field: 'weapon' | 'green') {
    if (!ids.length) return;
    const col = field === 'weapon' ? 'weapon_check_at' : 'green_check_at';
    const now = new Date().toISOString();
    const { error } = await supabase.from('weapons_item_serials').update({ [col]: now }).in('id', ids);
    if (error) { alert(error.message); return; }
    const idSet = new Set(ids);
    setSerials((prev) => prev.map((s) => (idSet.has(s.id) ? { ...s, [col]: now } : s)));
  }

  async function toggleExempt(item: WeaponsItem) {
    const next = !item.no_check_required;
    const { error } = await supabase.from('weapons_items').update({ no_check_required: next }).eq('id', item.id);
    if (error) { alert(error.message); return; }
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, no_check_required: next } : i)));
  }

  // ── Item filter: text search + pinned (qty view) ──────────────────────────

  const textMatches = items.filter((i) => i.name.includes(itemSearch));
  const visibleItems = pinnedItems.size > 0
    ? items.filter((i) => pinnedItems.has(i.id))
    : textMatches;

  function togglePin(id: string) {
    setPinnedItems((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Serial search (qty view) ──────────────────────────────────────────────

  const serialTrimmed = serialSearch.trim();
  const serialHit = serialTrimmed.length >= 2
    ? serials.find((r) => r.serial_number.toLowerCase().includes(serialTrimmed.toLowerCase()))
    : null;
  const serialHitItem  = serialHit ? items.find((i) => i.id === serialHit.item_id) : null;

  // ── Detail modal ──────────────────────────────────────────────────────────

  function openDetail(item: WeaponsItem, unit: UnitRow) {
    const rows = serials.filter((r) => r.item_id === item.id && r.unit_id === unit.id);
    if (rows.length === 0) return;
    setDetail({ itemId: item.id, itemName: item.name, unitId: unit.id, unitName: unit.name, rows });
  }

  // ── Serial view rows: enrich + filter + sort ──────────────────────────────

  const itemById = new Map(items.map((i) => [i.id, i]));
  const unitById = new Map(units.map((u) => [u.id, u.name]));

  interface SerialView extends SerialRow { itemName: string; unitName: string; noCheckRequired: boolean; }
  let serialRows: SerialView[] = serials.map((r) => {
    const item = itemById.get(r.item_id);
    return {
      ...r,
      itemName: item?.name ?? '—',
      noCheckRequired: item?.no_check_required ?? false,
      unitName: r.unit_id ? (unitById.get(r.unit_id) ?? '—') : '—',
    };
  });
  // Raspar sees only their own unit
  if (isRaspar && raspUnitId) serialRows = serialRows.filter((r) => r.unit_id === raspUnitId);
  // Search by serial / soldier name / personal number
  const sq = serialQuery.trim().toLowerCase();
  if (sq) {
    serialRows = serialRows.filter((r) =>
      r.serial_number.toLowerCase().includes(sq) ||
      (r.assigned_to_name ?? '').toLowerCase().includes(sq) ||
      r.assigned_to_pn.toLowerCase().includes(sq)
    );
  }
  const rowDue = (r: SerialView) =>
    checkStatus(r.weapon_check_at, r.noCheckRequired) === 'due' ||
    checkStatus(r.green_check_at, r.noCheckRequired) === 'due';
  serialRows = [...serialRows].sort((a, b) => {
    if (sortDue) {
      const d = Number(rowDue(b)) - Number(rowDue(a));
      if (d !== 0) return d;
    }
    return a.itemName.localeCompare(b.itemName, 'he') ||
           a.serial_number.localeCompare(b.serial_number);
  });

  // Collapse synthetic qty rows: one row per (item, soldier, unit) showing a
  // count in the צ׳ column instead of the internal __qty__ serial string.
  // `ids` keeps every underlying serial id so a check marks the whole group, and
  // the aggregate check date is null (= due) if ANY item in the group is missing
  // it, otherwise the oldest date in the group.
  interface DisplayRow extends SerialView { quantity: number; isQty: boolean; ids: string[]; }
  // null wins (a missing check means the group is due); otherwise keep the oldest.
  const oldestOrNull = (a: string | null, b: string | null): string | null =>
    a === null || b === null ? null : (a < b ? a : b);
  const displayRows: DisplayRow[] = [];
  const qtyIndex = new Map<string, DisplayRow>();
  for (const r of serialRows) {
    if (isQtySerial(r.serial_number)) {
      const key = `${r.item_id}::${r.assigned_to_pn}::${r.unit_id ?? ''}`;
      const ex = qtyIndex.get(key);
      if (ex) {
        ex.quantity += 1;
        ex.ids.push(r.id);
        ex.weapon_check_at = oldestOrNull(ex.weapon_check_at, r.weapon_check_at);
        ex.green_check_at = oldestOrNull(ex.green_check_at, r.green_check_at);
        continue;
      }
      const dr: DisplayRow = { ...r, quantity: 1, isQty: true, ids: [r.id] };
      qtyIndex.set(key, dr);
      displayRows.push(dr);
    } else {
      displayRows.push({ ...r, quantity: 1, isQty: false, ids: [r.id] });
    }
  }

  // Small reusable cell for a single check column
  function CheckCell({ r, field }: { r: DisplayRow; field: 'weapon' | 'green' }) {
    const dateStr = field === 'weapon' ? r.weapon_check_at : r.green_check_at;
    const status = checkStatus(dateStr, r.noCheckRequired);
    if (status === 'exempt') {
      return <span className="badge bg-slate-100 text-slate-400">לא נדרש</span>;
    }
    const label = status === 'due' ? 'דרוש בדיקה' : new Date(dateStr!).toLocaleDateString('he-IL');
    const tone = status === 'due' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700';
    if (!canMark(r.unit_id)) {
      return <span className={`badge ${tone}`}>{label}</span>;
    }
    return (
      <button type="button" onClick={() => markCheck(r.ids, field)} title="סמן כנבדק היום"
        className={`badge cursor-pointer transition ${tone} ${status === 'due' ? 'hover:bg-red-100' : 'hover:bg-emerald-100'}`}>
        {label}
      </button>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">מצאי נשקייה</h1>
      </div>

      {/* View tabs */}
      <div className="flex border-b border-slate-200">
        {([['qty', 'סיכום כמותי'], ['serial', 'סיכום לפי צ׳']] as [View, string][]).map(([v, label]) => (
          <button key={v} type="button" onClick={() => setView(v)}
            className={`flex-1 py-2.5 text-sm font-bold transition border-b-2 ${
              view === v ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ══ View 1: quantitative summary (item × unit matrix) ══ */}
      {view === 'qty' && (
        <>
          {/* Summary badges */}
          {!loading && units.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {units.map((u) => {
                const t = unitTotal(u.id);
                return t > 0 ? <span key={u.id} className="badge bg-slate-100 text-slate-700">{u.name}: {t}</span> : null;
              })}
            </div>
          )}

          {/* Search area */}
          <div className="card space-y-3">
            {/* Item search + pinned chips */}
            <div>
              <input
                className="input"
                placeholder="חיפוש פריט..."
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
              />
              {itemSearch && pinnedItems.size === 0 && textMatches.length > 0 && textMatches.length < items.length && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {textMatches.map((i) => (
                    <button key={i.id} type="button"
                      onClick={() => { togglePin(i.id); setItemSearch(''); }}
                      className="badge bg-slate-100 text-slate-700 hover:bg-emerald-100 hover:text-emerald-800 cursor-pointer transition text-xs">
                      {i.name} +
                    </button>
                  ))}
                </div>
              )}
              {pinnedItems.size > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                  <span className="text-xs text-slate-500">מסנן:</span>
                  {[...pinnedItems].map((id) => {
                    const item = items.find((i) => i.id === id);
                    return item ? (
                      <button key={id} type="button"
                        onClick={() => togglePin(id)}
                        className="badge bg-emerald-100 text-emerald-800 cursor-pointer hover:bg-red-100 hover:text-red-700 transition text-xs">
                        {item.name} ×
                      </button>
                    ) : null;
                  })}
                  <button type="button" onClick={() => setPinnedItems(new Set())}
                    className="text-xs text-slate-400 hover:text-slate-700">נקה הכל</button>
                </div>
              )}
            </div>

            {/* Serial search */}
            <div>
              <input
                className="input"
                placeholder="חיפוש לפי מספר צ׳..."
                dir="ltr"
                value={serialSearch}
                onChange={(e) => setSerialSearch(e.target.value)}
              />
              {serialTrimmed.length >= 2 && (
                <div className="mt-2 text-sm">
                  {serialHit ? (
                    <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <span className="font-mono text-amber-800">{serialHit.serial_number}</span>
                      <span className="text-slate-600">{serialHitItem?.name ?? '—'}</span>
                      <span className="text-slate-500">→</span>
                      <span className="font-medium">{serialHit.assigned_to_name ?? serialHit.assigned_to_pn}</span>
                      <span className="text-xs text-slate-400">{serialHit.assigned_to_pn}</span>
                    </div>
                  ) : (
                    <p className="text-slate-400 text-xs px-1">לא נמצא צ׳ תואם</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="text-center text-slate-400 py-12">טוען נתונים...</div>
          ) : (
            <div className="card p-0 overflow-x-auto max-w-full mx-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>פריט</th>
                    {units.map((u) => <th key={u.id} className="text-center">{u.name}</th>)}
                    <th className="text-center">סה"כ חתום</th>
                    <th className="text-center">מלאי נשקייה</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => {
                    const issued = totalIssued(item.id);
                    const stock  = stockFor(item);
                    return (
                      <tr key={item.id}>
                        <td>
                          <button type="button" onClick={() => togglePin(item.id)}
                            className={`text-right font-medium transition ${
                              pinnedItems.has(item.id) ? 'text-emerald-700' : 'text-slate-800 hover:text-emerald-700'
                            }`}>
                            {item.name}
                          </button>
                        </td>
                        {units.map((u) => {
                          const n = counts[item.id]?.[u.id] ?? 0;
                          return (
                            <td key={u.id} className="text-center">
                              {n > 0 ? (
                                <button type="button"
                                  onClick={() => openDetail(item, u)}
                                  className="badge bg-amber-50 text-amber-700 font-semibold hover:bg-amber-100 transition cursor-pointer">
                                  {n}
                                </button>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="text-center font-bold text-slate-700">
                          {issued > 0 ? issued : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="text-center">
                          <span className={stock > 0 ? 'font-semibold text-emerald-700' : 'text-slate-400'}>
                            {stock}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {visibleItems.length === 0 && (
                    <tr>
                      <td colSpan={units.length + 3} className="text-center text-slate-400 py-8 text-sm">
                        לא נמצאו פריטים
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ══ View 2: per-serial summary with inspection status ══ */}
      {view === 'serial' && (
        <>
          <div className="card space-y-3">
            <input
              className="input"
              placeholder="חיפוש לפי צ׳ / שם חייל / מ.א..."
              value={serialQuery}
              onChange={(e) => setSerialQuery(e.target.value)}
            />
            <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
              <input type="checkbox" checked={sortDue} onChange={(e) => setSortDue(e.target.checked)}
                className="w-4 h-4 accent-emerald-600" />
              <span className="text-sm text-slate-600">מיין לפי "דרוש בדיקה" תחילה</span>
            </label>
          </div>

          {loading ? (
            <div className="text-center text-slate-400 py-12">טוען נתונים...</div>
          ) : (
            <div className="card p-0 overflow-x-auto max-w-full mx-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>מסגרת</th>
                    <th>פריט</th>
                    <th>צ׳</th>
                    <th>שם החייל</th>
                    <th className="text-center">בדיקת נשק/אופטיקה</th>
                    <th className="text-center">ירוק בעיניים</th>
                    {isAdmin && <th className="text-center">פטור בדיקה</th>}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((r) => (
                    <tr key={r.id}>
                      <td className="text-sm text-slate-600">{r.unitName}</td>
                      <td className="font-medium">{r.itemName}</td>
                      <td className={r.isQty ? '' : 'font-mono'} dir={r.isQty ? undefined : 'ltr'}>
                        {r.isQty ? r.quantity : r.serial_number}
                      </td>
                      <td className="whitespace-nowrap">{r.assigned_to_name ?? r.assigned_to_pn}</td>
                      <td className="text-center">
                        <CheckCell r={r} field="weapon" />
                      </td>
                      <td className="text-center">
                        <CheckCell r={r} field="green" />
                      </td>
                      {isAdmin && (
                        <td className="text-center">
                          <input
                            type="checkbox"
                            className="w-4 h-4 accent-emerald-600 cursor-pointer"
                            checked={r.noCheckRequired}
                            onChange={() => { const it = itemById.get(r.item_id); if (it) toggleExempt(it); }}
                            title="פריט לא דורש בדיקה"
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                  {displayRows.length === 0 && (
                    <tr>
                      <td colSpan={isAdmin ? 7 : 6} className="text-center text-slate-400 py-8 text-sm">
                        לא נמצאו צ׳ משויכים
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">{detail.itemName}</h3>
                <p className="text-sm text-slate-500">{detail.unitName} · {detail.rows.length} חתומים</p>
              </div>
              <button onClick={() => setDetail(null)}
                className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-auto max-h-80">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-right p-2 font-medium">שם</th>
                    <th className="text-right p-2 font-medium">מ.א</th>
                    <th className="text-right p-2 font-medium">צ׳</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const item = itemById.get(detail.itemId);
                    const isQtyItem = item ? !item.has_serials : detail.rows.some((r) => isQtySerial(r.serial_number));
                    if (isQtyItem) {
                      // Quantity-tracked item → one row per soldier with a count (not a צ׳).
                      const byPn = new Map<string, { name: string | null; pn: string; qty: number }>();
                      for (const r of detail.rows) {
                        const ex = byPn.get(r.assigned_to_pn);
                        if (ex) ex.qty += 1;
                        else byPn.set(r.assigned_to_pn, { name: r.assigned_to_name, pn: r.assigned_to_pn, qty: 1 });
                      }
                      return [...byPn.values()].map((v) => (
                        <tr key={v.pn} className="border-b border-slate-100 last:border-0">
                          <td className="p-2">{v.name ?? '—'}</td>
                          <td className="p-2 text-slate-500">{v.pn}</td>
                          <td className="p-2">{v.qty}</td>
                        </tr>
                      ));
                    }
                    return detail.rows.map((r) => (
                      <tr key={r.serial_number} className="border-b border-slate-100 last:border-0">
                        <td className="p-2">{r.assigned_to_name ?? '—'}</td>
                        <td className="p-2 text-slate-500">{r.assigned_to_pn}</td>
                        <td className="p-2 font-mono" dir="ltr">{r.serial_number}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setDetail(null)} className="btn-secondary">סגור</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
