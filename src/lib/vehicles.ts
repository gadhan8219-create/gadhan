import { supabase } from './supabase';

// רכב — vehicle registry. Vehicles are tied to a unit and a type (יר״מ / לבן /
// צבאי). Documents (יר״מ form, license) live in the `vehicle-docs` Storage
// bucket and are referenced from the row's `documents` jsonb array.

export type VehicleTypeName = 'יר״מ' | 'לבן' | 'צבאי';

export interface VehicleType {
  id: string;
  name: string;
  created_at: string;
}

export interface VehicleDoc {
  name: string; // label, e.g. "טופס יר״מ" / "רשיון"
  url: string;
  uploaded_at: string;
}

export interface Vehicle {
  id: string;
  car_plate: string;
  unit_id: string | null;
  type_id: string;
  documents: VehicleDoc[];
  next_test_date: string | null;
  next_test_range: number | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleInput {
  car_plate: string;
  unit_id: string | null;
  type_id: string;
  next_test_date?: string | null;
  next_test_range?: number | null;
}

// Reminder window: a vehicle is "due" when fewer than this many days remain
// until its next test date (overdue dates count too).
export const TEST_ALERT_DAYS = 4;

export async function listVehicleTypes(): Promise<VehicleType[]> {
  const { data, error } = await supabase.from('vehicle_types').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as VehicleType[];
}

/** Resolve a type name (יר״מ / לבן / צבאי) to its id. */
export async function typeIdByName(name: VehicleTypeName): Promise<string> {
  const { data, error } = await supabase.from('vehicle_types').select('id').eq('name', name).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`סוג רכב "${name}" לא קיים`);
  return (data as { id: string }).id;
}

/** List vehicles of a given type, optionally restricted to one unit. */
export async function listVehicles(typeId: string, unitId: string | null): Promise<Vehicle[]> {
  let q = supabase.from('vehicles').select('*').eq('type_id', typeId).order('car_plate');
  if (unitId) q = q.eq('unit_id', unitId);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as Vehicle[]).map(normalizeDocs);
}

/** List all vehicles whose next test is within TEST_ALERT_DAYS (or overdue). */
export async function listVehiclesDueForTest(unitId: string | null): Promise<Vehicle[]> {
  let q = supabase.from('vehicles').select('*').not('next_test_date', 'is', null).order('next_test_date');
  if (unitId) q = q.eq('unit_id', unitId);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as Vehicle[])
    .map(normalizeDocs)
    .filter((v) => v.next_test_date !== null && daysUntil(v.next_test_date) < TEST_ALERT_DAYS);
}

export async function createVehicle(input: VehicleInput): Promise<Vehicle> {
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      car_plate: input.car_plate.trim(),
      unit_id: input.unit_id,
      type_id: input.type_id,
      next_test_date: input.next_test_date ?? null,
      next_test_range: input.next_test_range ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return normalizeDocs(data as Vehicle);
}

export async function updateVehicle(
  id: string,
  patch: Partial<Pick<Vehicle, 'car_plate' | 'unit_id' | 'next_test_date' | 'next_test_range' | 'documents'>>,
): Promise<void> {
  const { error } = await supabase
    .from('vehicles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteVehicle(id: string): Promise<void> {
  const { error } = await supabase.from('vehicles').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Upload a document for a vehicle and attach it to the row. A document with the
 * same label replaces the previous one (so re-uploading a license overwrites).
 */
export async function uploadVehicleDoc(vehicle: Vehicle, label: string, file: File): Promise<VehicleDoc[]> {
  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
  const safePlate = vehicle.car_plate.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '_') || 'doc';
  const path = `${vehicle.id}/${safeLabel}-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('vehicle-docs')
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true });
  if (upErr) throw upErr;
  const downloadName = `${label} ${safePlate}.${ext}`;
  const { data: pub } = supabase.storage.from('vehicle-docs').getPublicUrl(path, { download: downloadName });

  const next: VehicleDoc[] = [
    ...vehicle.documents.filter((d) => d.name !== label),
    { name: label, url: pub.publicUrl, uploaded_at: new Date().toISOString() },
  ];
  await updateVehicle(vehicle.id, { documents: next });
  return next;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function normalizeDocs(v: Vehicle): Vehicle {
  const docs = Array.isArray(v.documents) ? v.documents : [];
  return { ...v, documents: docs as VehicleDoc[] };
}

/** Whole-day difference between a YYYY-MM-DD date and today (negative = past). */
export function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}
