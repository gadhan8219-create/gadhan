// Resolves the service-role credential for edge functions.
//
// This project uses the NEW Supabase API-key format (publishable / secret).
// Once the legacy JWT keys are disabled, the auto-injected
// `SUPABASE_SERVICE_ROLE_KEY` (a legacy JWT) is downgraded to anon and the DB
// rejects it with "Invalid API key" / "permission denied". The new secret key
// (`sb_secret_…`) still acts as a full service-role credential and bypasses RLS.
//
// Supabase injects `SUPABASE_SECRET_KEYS` as JSON — typically an object like
// {"default":"sb_secret_…"}, but we also handle array and plain-string forms.
export function resolveServiceKey(): string {
  const raw = (Deno.env.get('SUPABASE_SECRET_KEYS') ?? '').trim();
  if (raw) {
    if (raw.startsWith('{') || raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const first = parsed.find((v) => typeof v === 'string');
          if (first) return first as string;
        } else if (parsed && typeof parsed === 'object') {
          const val = parsed.default ?? Object.values(parsed).find((v) => typeof v === 'string');
          if (typeof val === 'string' && val) return val;
        }
      } catch { /* fall through */ }
    }
    const first = raw.split(',')[0].trim();
    if (first.startsWith('sb_secret')) return first;
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}
