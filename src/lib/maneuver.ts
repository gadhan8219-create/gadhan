import { supabase } from './supabase';

// סעיף 15א — דרישות תמרון + כניסות/יציאות.

export interface ManeuverCategory {
  id: string;
  name: string;
  created_at: string;
}

export interface ManeuverRequirement {
  id: string;
  unit_id: string;
  team_id: string | null;
  category_id: string;
  categoryName: string;
  requirement: string;
  created_at: string;
}

export interface ManeuverEntry {
  id: string;
  unit_id: string;
  soldier_id: string;
  is_entry: boolean;
  date: string;
  soldierName: string;
  soldierPN: string;
}

/** Local YYYY-MM-DD for tomorrow (avoids the UTC shift of toISOString). */
export function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// ── Categories ────────────────────────────────────────────────────────────────
export async function listCategories(): Promise<ManeuverCategory[]> {
  const { data, error } = await supabase.from('maneuver_categories').select('*').order('created_at');
  if (error) throw error;
  return (data ?? []) as ManeuverCategory[];
}

export async function createCategory(name: string): Promise<ManeuverCategory> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('שם קטגוריה חסר');
  const { data, error } = await supabase.from('maneuver_categories').insert({ name: trimmed }).select().single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('קטגוריה בשם זה כבר קיימת');
    throw error;
  }
  return data as ManeuverCategory;
}

// ── Requirements ──────────────────────────────────────────────────────────────
/** Split free text (commas / newlines) into one trimmed requirement per line. */
export function splitRequirements(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function addRequirements(
  unitId: string,
  teamId: string | null,
  categoryId: string,
  requirements: string[],
): Promise<void> {
  if (requirements.length === 0) throw new Error('לא הוזנו דרישות');
  const rows = requirements.map((requirement) => ({
    unit_id: unitId,
    team_id: teamId,
    category_id: categoryId,
    requirement,
  }));
  const { error } = await supabase.from('maneuver_requirements').insert(rows);
  if (error) throw error;
}

export async function listRequirements(unitId: string): Promise<ManeuverRequirement[]> {
  const { data, error } = await supabase
    .from('maneuver_requirements')
    .select('id, unit_id, team_id, category_id, requirement, created_at, maneuver_categories(name)')
    .eq('unit_id', unitId)
    .order('created_at');
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{
    id: string; unit_id: string; team_id: string | null; category_id: string;
    requirement: string; created_at: string; maneuver_categories: { name: string } | null;
  }>).map((r) => ({
    id: r.id,
    unit_id: r.unit_id,
    team_id: r.team_id,
    category_id: r.category_id,
    categoryName: r.maneuver_categories?.name ?? '—',
    requirement: r.requirement,
    created_at: r.created_at,
  }));
}

export async function deleteRequirements(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('maneuver_requirements').delete().in('id', ids);
  if (error) throw error;
}

// ── Entries / exits ───────────────────────────────────────────────────────────
export async function addEntries(
  unitId: string,
  isEntry: boolean,
  soldierIds: string[],
  date: string,
): Promise<void> {
  if (soldierIds.length === 0) return;
  const rows = soldierIds.map((soldier_id) => ({ unit_id: unitId, soldier_id, is_entry: isEntry, date }));
  const { error } = await supabase.from('maneuver_entries').insert(rows);
  if (error) throw error;
}

export async function listEntries(unitId: string): Promise<ManeuverEntry[]> {
  const { data, error } = await supabase
    .from('maneuver_entries')
    .select('id, unit_id, soldier_id, is_entry, date, soldiers(full_name, personal_number)')
    .eq('unit_id', unitId)
    .order('created_at');
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{
    id: string; unit_id: string; soldier_id: string; is_entry: boolean; date: string;
    soldiers: { full_name: string; personal_number: string } | null;
  }>).map((r) => ({
    id: r.id,
    unit_id: r.unit_id,
    soldier_id: r.soldier_id,
    is_entry: r.is_entry,
    date: r.date,
    soldierName: r.soldiers?.full_name ?? '—',
    soldierPN: r.soldiers?.personal_number ?? '—',
  }));
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('maneuver_entries').delete().eq('id', id);
  if (error) throw error;
}

/** "בוצע" — clear all of a unit's entry/exit lists. */
export async function deleteEntriesForUnit(unitId: string): Promise<void> {
  const { error } = await supabase.from('maneuver_entries').delete().eq('unit_id', unitId);
  if (error) throw error;
}
