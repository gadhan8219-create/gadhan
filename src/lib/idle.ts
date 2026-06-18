// Idle-logout primitives shared by the auth provider and the useIdleLogout hook.
// Kept in their own module so auth.tsx and useIdleLogout.ts don't import each
// other (which would form a circular dependency).

/** Sign the user out after this much inactivity. */
export const IDLE_MS = 30 * 60 * 1000; // 30 minutes

/** Shared across tabs so a backgrounded tab can detect it slept past the limit. */
export const STORAGE_KEY = 'gadhan-last-activity';

/**
 * Stamp "active now". Call this on a fresh sign-in so the idle window starts
 * clean — otherwise the mount check in useIdleLogout would read a stale timestamp
 * left by a previous (already-expired) session and log the user straight back out.
 */
export function touchIdleActivity() {
  try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch { /* storage unavailable */ }
}
