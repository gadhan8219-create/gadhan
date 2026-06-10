import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { WeaponsItem } from '../../lib/database.types';

interface UnitRow   { id: string; name: string; }
interface SerialRow {
  item_id: string;
  serial_number: string;
  assigned_to_pn:   string;
  assigned_to_name: string | null;
  unit_id: string | null; // resolved from soldiers
}

interface DetailModal {
  itemId:   string;
  itemName: string;
  unitId:   string;
  unitName: string;
  rows: SerialRow[];
}

export default function WeaponsInventoryPage() {
  const [items,      setItems]      = useState<WeaponsItem[]>([]);
  const [units,      setUnits]      = useState<UnitRow[]>([]);
  const [serials,    setSerials]    = useState<SerialRow[]>([]);
  // total serials per item (regardless of assignment)
  const [totalCounts, setTotalCounts] = useState<Record<string, number>>({});
  // issued counts: pivot[itemId][unitId]
  const [counts,     setCounts]     = useState<Record<string, Record<string, number>>>({});
  const [loading,    setLoading]    = useState(true);

  // Filters
  const [itemSearch,    setItemSearch]    = useState('');
  const [pinnedItems,   setPinnedItems]   = useState<Set<string>>(new Set());
  const [serialSearch,  setSerialSearch]  = useState('');

  // Detail modal
  const [detail, setDetail] = useState<DetailModal | null>(null);

  useEffect(() => {
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
          .select('item_id, serial_number, assigned_to_pn, assigned_to_name')
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
        item_id: string; serial_number: string; assigned_to_pn: string; assigned_to_name: string | null
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
    load();
  }, []);

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

  // ── Item filter: text search + pinned ────────────────────────────────────

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

  // ── Serial search ─────────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">סיכום נשקייה לפי מסגרת</h1>
      </div>

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
          {/* Matching suggestions (when typing) */}
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
          {/* Pinned chips */}
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
        <div className="table-wrap card p-0 overflow-x-auto">
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
                  {detail.rows.map((r) => (
                    <tr key={r.serial_number} className="border-b border-slate-100 last:border-0">
                      <td className="p-2">{r.assigned_to_name ?? '—'}</td>
                      <td className="p-2 text-slate-500">{r.assigned_to_pn}</td>
                      <td className="p-2 font-mono" dir="ltr">{r.serial_number}</td>
                    </tr>
                  ))}
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
