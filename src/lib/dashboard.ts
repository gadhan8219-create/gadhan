import { supabase } from './supabase';
import { loadUnitInspectionReport, inspectionStatus } from './serialInspections';
import { getAttendanceForDate, listStatuses } from './attendance';

// Dashboard aggregations. All metrics are computed per unit; pass a unitId to
// restrict (raspar → own unit) or null for every unit (admin).

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
function fresh(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return Date.now() - new Date(dateStr).getTime() <= WEEK_MS;
}
function pct(ok: number, total: number): number {
  return total === 0 ? 0 : Math.round((ok / total) * 100);
}

// ── Radio "ירוק בעיניים" (serial inspections) per unit ───────────────────────
export interface UnitPct {
  unitId: string;
  unitName: string;
  total: number;
  ok: number;
  pct: number;
}

export async function radioGreenByUnit(unitId: string | null): Promise<UnitPct[]> {
  const rows = await loadUnitInspectionReport(unitId);
  const m = new Map<string, { name: string; total: number; ok: number }>();
  for (const r of rows) {
    const cur = m.get(r.unitId) ?? { name: r.unitName, total: 0, ok: 0 };
    cur.total++;
    if (inspectionStatus(r.lastInspectedAt) === 'found') cur.ok++;
    m.set(r.unitId, cur);
  }
  return Array.from(m.entries())
    .map(([id, v]) => ({ unitId: id, unitName: v.name, total: v.total, ok: v.ok, pct: pct(v.ok, v.total) }))
    .sort((a, b) => a.unitName.localeCompare(b.unitName, 'he'));
}

// ── Weapons checks per unit (green-check + weapon/optics check) ───────────────
export interface WeaponsUnitChecks {
  unitId: string;
  unitName: string;
  total: number;
  greenOk: number;
  weaponOk: number;
  greenPct: number;
  weaponPct: number;
}

export async function weaponsChecksByUnit(unitId: string | null): Promise<WeaponsUnitChecks[]> {
  const [serRes, solRes, itemRes, unitRes] = await Promise.all([
    supabase
      .from('weapons_item_serials')
      .select('item_id, assigned_to_pn, weapon_check_at, green_check_at')
      .not('assigned_to_pn', 'is', null),
    supabase.from('soldiers').select('personal_number, unit_id'),
    supabase.from('weapons_items').select('id, no_check_required'),
    supabase.from('units').select('id, name'),
  ]);

  const pnToUnit = new Map<string, string>();
  for (const s of (solRes.data ?? []) as Array<{ personal_number: string; unit_id: string }>) {
    pnToUnit.set(s.personal_number, s.unit_id);
  }
  const exempt = new Map(((itemRes.data ?? []) as Array<{ id: string; no_check_required: boolean }>).map((i) => [i.id, i.no_check_required]));
  const unitName = new Map(((unitRes.data ?? []) as Array<{ id: string; name: string }>).map((u) => [u.id, u.name]));

  const m = new Map<string, { total: number; greenOk: number; weaponOk: number }>();
  for (const r of (serRes.data ?? []) as Array<{ item_id: string; assigned_to_pn: string; weapon_check_at: string | null; green_check_at: string | null }>) {
    if (exempt.get(r.item_id)) continue; // exempt items require no checks
    const uid = pnToUnit.get(r.assigned_to_pn);
    if (!uid) continue;
    if (unitId && uid !== unitId) continue;
    const cur = m.get(uid) ?? { total: 0, greenOk: 0, weaponOk: 0 };
    cur.total++;
    if (fresh(r.green_check_at)) cur.greenOk++;
    if (fresh(r.weapon_check_at)) cur.weaponOk++;
    m.set(uid, cur);
  }
  return Array.from(m.entries())
    .map(([id, v]) => ({
      unitId: id,
      unitName: unitName.get(id) ?? '?',
      total: v.total,
      greenOk: v.greenOk,
      weaponOk: v.weaponOk,
      greenPct: pct(v.greenOk, v.total),
      weaponPct: pct(v.weaponOk, v.total),
    }))
    .sort((a, b) => a.unitName.localeCompare(b.unitName, 'he'));
}

// ── Daily attendance summary per unit ────────────────────────────────────────
export interface UnitAttendance {
  unitId: string;
  unitName: string;
  totalSoldiers: number;
  reported: number;
  performed: boolean; // every soldier reported
  byStatus: Array<{ status: string; count: number }>;
}

export async function attendanceDailyByUnit(date: string, unitId: string | null): Promise<UnitAttendance[]> {
  const [solRes, unitRes, att, statuses] = await Promise.all([
    supabase.from('soldiers').select('id, unit_id'),
    supabase.from('units').select('id, name'),
    getAttendanceForDate(date),
    listStatuses(),
  ]);

  const statusName = new Map(statuses.map((s) => [s.id, s.status]));
  const soldiers = (solRes.data ?? []) as Array<{ id: string; unit_id: string }>;
  const soldierUnit = new Map(soldiers.map((s) => [s.id, s.unit_id]));
  let units = (unitRes.data ?? []) as Array<{ id: string; name: string }>;
  if (unitId) units = units.filter((u) => u.id === unitId);

  const totals = new Map<string, number>();
  for (const s of soldiers) totals.set(s.unit_id, (totals.get(s.unit_id) ?? 0) + 1);

  const reportedByUnit = new Map<string, number>();
  const statusCounts = new Map<string, Map<string, number>>();
  for (const a of att) {
    const uid = soldierUnit.get(a.soldier_id);
    if (!uid) continue;
    reportedByUnit.set(uid, (reportedByUnit.get(uid) ?? 0) + 1);
    if (!statusCounts.has(uid)) statusCounts.set(uid, new Map());
    const sm = statusCounts.get(uid)!;
    const sn = statusName.get(a.status_id) ?? '—';
    sm.set(sn, (sm.get(sn) ?? 0) + 1);
  }

  return units
    .map((u) => {
      const total = totals.get(u.id) ?? 0;
      const reported = reportedByUnit.get(u.id) ?? 0;
      const byStatus = Array.from((statusCounts.get(u.id) ?? new Map<string, number>()).entries())
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count);
      return { unitId: u.id, unitName: u.name, totalSoldiers: total, reported, performed: total > 0 && reported === total, byStatus };
    })
    .sort((a, b) => a.unitName.localeCompare(b.unitName, 'he'));
}
