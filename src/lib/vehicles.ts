import { supabase } from './supabase';

// רכב — vehicle registry.
//
// `vehicle_types` is a CATALOG of vehicle models (since migration 0037): each row
// is a model (name, e.g. "משאית קירור") that belongs to a category (type:
// יר״מ / לבן / צבאי) and declares whether vehicles of that model need uploaded
// documents (license). `vehicles` ties a plate to a unit and to one catalog model
// (type_id), with documents, the next-test reminder (date or kilometrage) and the
// current mileage. Documents live in the `vehicle-docs` Storage bucket.

export type VehicleCategory = 'יר״מ' | 'לבן' | 'צבאי';
export const VEHICLE_CATEGORIES: VehicleCategory[] = ['יר״מ', 'לבן', 'צבאי'];

export interface VehicleType {
  id: string;
  name: string;            // model name, e.g. "משאית קירור"
  type: VehicleCategory;   // category
  license: boolean;        // model requires uploaded documents
  created_at: string;
}

export interface VehicleTypeInput {
  name: string;
  type: VehicleCategory;
  license: boolean;
}

export interface VehicleDoc {
  name: string;  // label, e.g. "טופס יר״מ" / "רשיון"
  path: string;  // object path within the (private) vehicle-docs bucket
  uploaded_at: string;
  url?: string;  // legacy public URL on rows created before bucket privatization
}

export interface Vehicle {
  id: string;
  car_plate: string;
  unit_id: string | null;
  type_id: string;                 // → vehicle_types (catalog model)
  documents: VehicleDoc[];
  next_test_date: string | null;
  next_test_range: number | null;
  mileage: number | null;          // קילומטרג׳ נוכחי
  created_at: string;
  updated_at: string;
}

/** A vehicle enriched with its catalog model's name / category / license flag. */
export interface VehicleFull extends Vehicle {
  type_name: string;
  category: string;
  license: boolean;
}

export interface VehicleInput {
  car_plate: string;
  unit_id: string | null;
  type_id: string;
  next_test_date?: string | null;
  next_test_range?: number | null;
  mileage?: number | null;
}

// Document labels for models that require documents (license = true).
export const VEHICLE_DOC_LABELS = ['טופס', 'רשיון'];

// Reminder window: a vehicle is "due" when fewer than this many days remain
// until its next test date (overdue dates count too).
export const TEST_ALERT_DAYS = 4;

// ── Catalog (vehicle_types) ───────────────────────────────────────────────────

export async function listVehicleTypes(): Promise<VehicleType[]> {
  const { data, error } = await supabase.from('vehicle_types').select('*').order('type').order('name');
  if (error) throw error;
  return (data ?? []) as VehicleType[];
}

export async function createVehicleType(input: VehicleTypeInput): Promise<VehicleType> {
  const name = input.name.trim();
  if (!name) throw new Error('שם הכלי חסר');
  const { data, error } = await supabase
    .from('vehicle_types')
    .insert({ name, type: input.type, license: input.license })
    .select('*')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('כלי בשם זה כבר קיים בסוג הזה');
    throw error;
  }
  return data as VehicleType;
}

export async function deleteVehicleType(id: string): Promise<void> {
  const { error } = await supabase.from('vehicle_types').delete().eq('id', id);
  if (error) {
    // 23503 = foreign_key_violation — a vehicle still references this model.
    if ((error as { code?: string }).code === '23503') {
      throw new Error('לא ניתן למחוק — קיימים רכבים מסוג זה');
    }
    throw error;
  }
}

// ── Vehicles ──────────────────────────────────────────────────────────────────

/** All vehicles (admin) or one unit's, enriched with their catalog model. */
export async function listVehiclesFull(unitId: string | null, category?: string): Promise<VehicleFull[]> {
  let q = supabase
    .from('vehicles')
    .select('*, vehicle_types(name, type, license)')
    .order('car_plate');
  if (unitId) q = q.eq('unit_id', unitId);
  const { data, error } = await q;
  if (error) throw error;
  let rows = ((data ?? []) as any[]).map((r) => ({
    ...normalizeDocs(r as Vehicle),
    type_name: r.vehicle_types?.name ?? '—',
    category: r.vehicle_types?.type ?? '—',
    license: r.vehicle_types?.license ?? false,
  })) as VehicleFull[];
  if (category) rows = rows.filter((r) => r.category === category);
  return rows;
}

/** All vehicles whose next test is within TEST_ALERT_DAYS (or overdue). */
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
  const plate = input.car_plate.trim();
  if (!plate) throw new Error('מספר רכב חסר');
  if (!input.type_id) throw new Error('נא לבחור שם וסוג כלי');

  // Friendly pre-check for an existing plate. RLS may hide vehicles of other
  // units, so this catches same-unit duplicates with a clear message; the DB
  // unique index (migration 0030) is the real guarantee across all units.
  const { data: dup } = await supabase
    .from('vehicles').select('id').eq('car_plate', plate).maybeSingle();
  if (dup) throw new Error('מספר רכב כבר קיים במערכת');

  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      car_plate: plate,
      unit_id: input.unit_id,
      type_id: input.type_id,
      next_test_date: input.next_test_date ?? null,
      next_test_range: input.next_test_range ?? null,
      mileage: input.mileage ?? null,
    })
    .select('*')
    .single();
  if (error) {
    // 23505 = unique_violation — a plate that exists in a unit this user can't see.
    if ((error as { code?: string }).code === '23505') {
      throw new Error('מספר רכב כבר קיים במערכת');
    }
    throw error;
  }
  return normalizeDocs(data as Vehicle);
}

export async function updateVehicle(
  id: string,
  patch: Partial<Pick<Vehicle, 'car_plate' | 'unit_id' | 'type_id' | 'next_test_date' | 'next_test_range' | 'mileage' | 'documents'>>,
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
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '_') || 'doc';
  const path = `${vehicle.id}/${safeLabel}-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('vehicle-docs')
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true });
  if (upErr) throw upErr;

  // Bucket is private (migration 0028): store the object path, not a public URL.
  // A short-lived signed URL is generated on demand at view time.
  const next: VehicleDoc[] = [
    ...vehicle.documents.filter((d) => d.name !== label),
    { name: label, path, uploaded_at: new Date().toISOString() },
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
