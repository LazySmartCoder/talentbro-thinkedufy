import type { UserType } from "@/lib/api";

// The role of the signed-in account, remembered for the life of the page.
//
// The loaders run *while* the session check is still in flight, so they cannot
// ask the API who is signed in without making the thing they are covering part
// of the delay. Every place that does learn the role — the session check, a
// successful sign-in, a sign-out — records it here, so a loader rendered later
// (or on the next navigation) can branch on it immediately.
const ROLE_STORAGE = "tb.user.role";

let cachedRole: UserType | null | undefined;

export function getUserRole(): UserType | null {
  if (cachedRole !== undefined) return cachedRole;
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(ROLE_STORAGE);
    cachedRole = stored === "student" || stored === "institution_staff" ? stored : null;
  } catch {
    cachedRole = null;
  }
  return cachedRole;
}

export function setUserRole(role: UserType | null | undefined): void {
  const normalized = role ?? null;
  cachedRole = normalized;
  if (typeof window === "undefined") return;
  try {
    if (normalized) {
      window.localStorage.setItem(ROLE_STORAGE, normalized);
    } else {
      window.localStorage.removeItem(ROLE_STORAGE);
    }
  } catch {
    // storage unavailable — the in-memory value still serves this page
  }
}

/**
 * Should the loaders print a motivation quote?
 *
 * The quotes are written for the candidate sitting in a training or interview
 * flow, so college staff (institution staff) get the spinner on its own. An
 * unknown role is treated as a candidate, because that is who every quote in
 * the pool was written for.
 */
export function shouldShowLoadingQuotes(): boolean {
  return getUserRole() !== "institution_staff";
}
