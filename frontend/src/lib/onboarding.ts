const KEY = "gv_onboarded";

/** No account needed to have "seen" the splash — this is a device-level flag,
 * not a user one, so it survives across guest browsing and persists after
 * login/logout too. */
export function hasSeenWelcome(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    // Private browsing can throw on storage access — fail open rather than
    // trap someone in a redirect loop over a marketing screen.
    return true;
  }
}

export function markWelcomeSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // Nothing to recover — worst case they see the splash again next visit.
  }
}
