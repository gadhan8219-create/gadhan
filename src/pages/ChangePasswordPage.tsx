import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { validatePassword, PASSWORD_RULE_TEXT } from '../lib/password';

/**
 * Self-service password change. Rendered two ways:
 *   - as the /change-password route (voluntary) — `forced` is false.
 *   - by ProtectedRoute as a blocking full-screen gate when the password is
 *     older than 60 days — `forced` is true (no cancel, only sign-out).
 */
export default function ChangePasswordPage({ forced = false }: { forced?: boolean }) {
  const { refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const weak = validatePassword(pw);
    if (weak) return setError(weak);
    if (pw !== confirm) return setError('הסיסמאות אינן תואמות');

    setLoading(true);
    const { error: upErr } = await supabase.auth.updateUser({ password: pw });
    if (upErr) {
      setLoading(false);
      return setError(upErr.message);
    }
    // Stamp the change so the 60-day clock restarts. Non-fatal: if the RPC isn't
    // deployed yet (migration 0029 not applied) the password still changes.
    try {
      await supabase.rpc('mark_password_changed');
    } catch {
      /* ignore — best-effort */
    }
    await refreshProfile();
    setLoading(false);
    navigate('/', { replace: true });
  }

  const form = (
    <form onSubmit={handleSubmit} className="card w-full max-w-md">
      <img src="/logo.png" alt="גדחה״ן" className="w-16 h-16 object-contain mx-auto mb-3" />
      <h1 className="text-lg font-bold text-center text-slate-900">
        {forced ? 'יש לעדכן סיסמה' : 'שינוי סיסמה'}
      </h1>
      <p className="text-sm text-slate-500 text-center mb-5">
        {forced ? 'הסיסמה שלך בתוקף של 60 יום פג. בחר סיסמה חדשה כדי להמשיך.' : PASSWORD_RULE_TEXT}
      </p>

      <label className="label" htmlFor="new-password">סיסמה חדשה</label>
      <input
        id="new-password"
        type="password"
        autoComplete="new-password"
        className="input mb-4"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        required
      />

      <label className="label" htmlFor="confirm-password">אימות סיסמה</label>
      <input
        id="confirm-password"
        type="password"
        autoComplete="new-password"
        className="input mb-4"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
      />

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full mb-2">
        {loading ? 'שומר...' : 'עדכן סיסמה'}
      </button>

      {forced ? (
        <button
          type="button"
          onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}
          className="btn-secondary w-full"
        >
          התנתק
        </button>
      ) : (
        <button type="button" onClick={() => navigate(-1)} className="btn-secondary w-full">
          ביטול
        </button>
      )}
    </form>
  );

  // Forced mode is a standalone gate (rendered outside Layout) — center it on a
  // full screen. The routed/voluntary mode renders inside Layout's main area.
  if (forced) {
    return <div className="min-h-screen flex items-center justify-center px-4">{form}</div>;
  }
  return <div className="flex justify-center pt-4">{form}</div>;
}
