export function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage can throw under several conditions:
    // - Privacy mode / cookies-disabled in some browsers throws SecurityError.
    // - Storage quota exceeded throws QuotaExceededError.
    // Settings are convenience state, so swallow the failure — the UI
    // still works without persistence.
  }
}
