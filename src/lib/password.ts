// Password policy — shared by the create-user form, the change-password screen,
// and (mirrored) the manage-users edge function. Keep the rules here in sync with
// the Supabase Dashboard → Authentication → Password policy, which enforces the
// same minimums server-side.

export const PASSWORD_MIN = 8;

/** Max password age before the user is forced to choose a new one. */
export const PASSWORD_MAX_AGE_DAYS = 60;

/** Human-readable rule, shown under password inputs. */
export const PASSWORD_RULE_TEXT = 'לפחות 8 תווים, הכוללים אות וספרה';

/** Returns a Hebrew error string if the password is too weak, else null. */
export function validatePassword(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `הסיסמה חייבת להכיל לפחות ${PASSWORD_MIN} תווים`;
  if (!/[A-Za-z]/.test(pw)) return 'הסיסמה חייבת לכלול לפחות אות אחת (באנגלית)';
  if (!/[0-9]/.test(pw)) return 'הסיסמה חייבת לכלול לפחות ספרה אחת';
  return null;
}

/**
 * True when the password is older than PASSWORD_MAX_AGE_DAYS. Null/undefined
 * (e.g. the column hasn't been migrated yet) is treated as "not expired" so the
 * frontend can ship before the migration lands.
 */
export function isPasswordExpired(changedAt: string | null | undefined): boolean {
  if (!changedAt) return false;
  const ageMs = Date.now() - new Date(changedAt).getTime();
  if (Number.isNaN(ageMs)) return false;
  return ageMs > PASSWORD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}
