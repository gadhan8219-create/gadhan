import { supabase } from './supabase';

// ── שלישות — דיווח נוכחות data access ────────────────────────────────────────

export interface AttendanceStatus {
  id: string;
  status: string;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  soldier_id: string;
  status_id: string;
  date: string;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceInput {
  soldier_id: string;
  status_id: string;
}

export const MAX_STATUS_LEN = 20;

// Local YYYY-MM-DD (avoids the UTC shift of toISOString on negative offsets).
export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// ── Statuses ─────────────────────────────────────────────────────────────────
export async function listStatuses(): Promise<AttendanceStatus[]> {
  const { data, error } = await supabase
    .from('attendance_statuses')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AttendanceStatus[];
}

export async function createStatus(status: string): Promise<AttendanceStatus> {
  const { data, error } = await supabase
    .from('attendance_statuses')
    .insert({ status })
    .select()
    .single();
  if (error) throw error;
  return data as AttendanceStatus;
}

// True when at least one attendance row references this status (blocks deletion).
export async function statusInUse(id: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('attendance')
    .select('id', { count: 'exact', head: true })
    .eq('status_id', id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function deleteStatus(id: string): Promise<void> {
  const { error } = await supabase.from('attendance_statuses').delete().eq('id', id);
  if (error) throw error;
}

// ── Attendance ───────────────────────────────────────────────────────────────
// All attendance rows for a given date (a single day is small; callers intersect
// with the soldiers of the unit they're displaying).
export async function getAttendanceForDate(date: string): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('date', date);
  if (error) throw error;
  return (data ?? []) as AttendanceRecord[];
}

// Upserts one row per soldier for the date. Re-confirming overwrites.
export async function confirmAttendance(date: string, records: AttendanceInput[]): Promise<void> {
  const { error } = await supabase.rpc('attendance_confirm_report', {
    p_date: date,
    p_records: records,
  });
  if (error) throw error;
}
