import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './auth';

/** Sign the user out after this much inactivity. */
const IDLE_MS = 30 * 60 * 1000; // 30 minutes
/** Shared across tabs so a backgrounded tab can detect it slept past the limit. */
const STORAGE_KEY = 'gadhan-last-activity';
/** Don't reset the timer more than once per second on a flood of events. */
const RESET_THROTTLE_MS = 1000;

/**
 * Logs the user out after 30 minutes with no interaction. Mount this once inside
 * the authenticated shell (Layout). Activity (mouse/keyboard/touch/scroll) keeps
 * the session alive; when a tab returns to the foreground we also re-check the
 * last-activity timestamp in case the timer was throttled while hidden.
 */
export function useIdleLogout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const timer = useRef<number | undefined>(undefined);
  const lastReset = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function logout() {
      if (cancelled) return;
      await signOut();
      navigate('/login', { replace: true });
    }

    function reset() {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(logout, IDLE_MS);
    }

    function onActivity() {
      const now = Date.now();
      if (now - lastReset.current < RESET_THROTTLE_MS) return;
      lastReset.current = now;
      reset();
    }

    function onVisibility() {
      if (document.visibilityState !== 'visible') return;
      const last = Number(localStorage.getItem(STORAGE_KEY) || Date.now());
      if (Date.now() - last >= IDLE_MS) logout();
      else reset();
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    reset();

    return () => {
      cancelled = true;
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisibility);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [signOut, navigate]);
}
