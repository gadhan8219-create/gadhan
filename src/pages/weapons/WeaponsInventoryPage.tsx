import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { WeaponsItem } from '../../lib/database.types';

interface UnitRow { id: string; name: string; }
interface SoldierRow { personal_number: string; unit_id: string; }

export default function WeaponsInventoryPage() {
  const [items, setItems] = useState<WeaponsItem[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  // counts[itemId][unitId] = how many serials are assigned to soldiers of that unit
  const [counts, setCounts] = useState<Record<string, Record<string, number>>>({});
  // For non-serial items: just quantity
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [wi, un, ser, sol] = await Promise.all([
        supabase.from('weapons_items').select('*').eq('active', true).order('name'),
        supabase.from('units').select('id, name').order('name'),
        supabase.from('weapons_item_serials').select('item_id, assigned_to_pn').not('assigned_to_pn', 'is', null),
        supabase.from('soldiers').select('personal_number, unit_id'),
      ]);

      if (wi.data) setItems(wi.data);
      if (un.data) setUnits(un.data);

      // Build personal_number → unit_id map
      const pnToUnit: Record<string, string> = {};
      for (const s of (sol.data ?? []) as SoldierRow[]) {
        pnToUnit[s.personal_number] = s.unit_id;
      }

      // Pivot: itemId × unitId = count
      const pivot: Record<string, Record<string, number>> = {};
      for (const row of (ser.data ?? []) as Array<{ item_id: string; assigned_to_pn: string }>) {
        const unitId = pnToUnit[row.assigned_to_pn];
        if (!unitId) continue; // soldier not found — skip
        if (!pivot[row.item_id]) pivot[row.item_id] = {};
        pivot[row.item_id][unitId] = (pivot[row.item_id][unitId] ?? 0) + 1;
      }
      setCounts(pivot);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = items.filter((i) => i.name.includes(search));

  // Total issued per item (across all units)
  function totalIssued(itemId: string) {
    return Object.values(counts[itemId] ?? {}).reduce((s, n) => s + n, 0);
  }

  // Total issued per unit (across all items)
  function unitTotal(unitId: string) {
    return items.reduce((s, i) => s + (counts[i.id]?.[unitId] ?? 0), 0);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">סיכום נשקייה לפי מסגרת</h1>
        <p className="text-slate-500 text-sm mt-1">כמות נפוקה לפי פריט ומסגרת</p>
      </div>

      {/* Summary badges */}
      {!loading && units.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {units.map((u) => {
            const t = unitTotal(u.id);
            return t > 0 ? (
              <span key={u.id} className="badge bg-slate-100 text-slate-700">{u.name}: {t}</span>
            ) : null;
          })}
        </div>
      )}

      <div className="card p-3">
        <input className="input" placeholder="חיפוש פריט..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-12">טוען נתונים...</div>
      ) : (
        <div className="table-wrap card p-0 overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>פריט</th>
                {units.map((u) => <th key={u.id} className="text-center">{u.name}</th>)}
                <th className="text-center">סה"כ נפוק</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const issued = totalIssued(item.id);
                return (
                  <tr key={item.id} className={issued === 0 ? 'opacity-40' : ''}>
                    <td className="font-medium text-slate-800">
                      {item.name}
                      {!item.has_serials && (
                        <span className="text-xs text-slate-400 mr-1">(כמות: {item.quantity ?? 0})</span>
                      )}
                    </td>
                    {units.map((u) => {
                      const n = counts[item.id]?.[u.id] ?? 0;
                      return (
                        <td key={u.id} className="text-center">
                          {n > 0
                            ? <span className="badge bg-amber-50 text-amber-700 font-semibold">{n}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                      );
                    })}
                    <td className="text-center font-bold text-slate-700">
                      {issued > 0 ? issued : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={units.length + 2} className="text-center text-slate-400 py-8 text-sm">לא נמצאו פריטים</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
