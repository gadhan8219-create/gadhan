import { supabase } from './supabase';

// ── Unified structured audit (יומן ביקורת) ──────────────────────────────────────
export type AuditCategory = 'נשקייה' | 'קשר' | 'בונקר' | 'רכב';

/** Action types per category (also drives the audit screen's filters). */
export const AUDIT_ACTIONS: Record<AuditCategory, string[]> = {
  'נשקייה': ['החתמה', 'זיכוי', 'אפסון', 'העברה', 'ראש בראש'],
  'קשר':    ['החתמת חייל', 'החתמת מסגרת', 'זיכוי'],
  'בונקר':  ['קבלות', 'ניפוק', 'זיכוי', 'העברה', 'וויסותים', 'שצ״ל'],
  'רכב':    ['עדכון'],
};

export const AUDIT_CATEGORIES = Object.keys(AUDIT_ACTIONS) as AuditCategory[];

/**
 * Record a structured action in the audit log. Best-effort — never throws, so a
 * failed audit can't break the real action.
 */
export async function logAction(params: {
  category: AuditCategory;
  actionType: string;
  soldierName?: string | null;
  items?: string[];
}): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from('audit_logs').insert({
      action: `${params.category} · ${params.actionType}`,
      performed_by: data.user?.id ?? null,
      category: params.category,
      action_type: params.actionType,
      soldier_name: params.soldierName ?? null,
      items: params.items && params.items.length ? params.items : null,
    });
  } catch { /* audit must never break the action */ }
}

export async function logAudit(params: {
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}) {
  const { data: userData } = await supabase.auth.getUser();
  await supabase.from('audit_logs').insert({
    action: params.action,
    performed_by: userData.user?.id ?? null,
    target_type: params.targetType ?? null,
    target_id: params.targetId ?? null,
    details: params.details ?? null,
  });
}
