import {
  hasStoredSession,
  storeTokens,
  clearTokens,
  getMe,
  checkGuestRecovery,
  confirmGuestRecovery,
  declineGuestRecovery,
  createGuest,
  type ApiUser,
} from "./api";

// A best-effort device signature — not meant to be bulletproof, just
// stable enough across reloads of the same browser/device to combine with
// IP for guest-recovery matching. Never sent pre-hashed: the server hashes
// it so raw fingerprint material never sits in the DB.
function canvasFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-canvas";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillText("listly-fp", 2, 2);
    return canvas.toDataURL();
  } catch {
    return "no-canvas";
  }
}

export function getFingerprint(): string {
  return [
    navigator.userAgent,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String(new Date().getTimezoneOffset()),
    canvasFingerprint(),
  ].join("::");
}

export interface RecoveryCandidate {
  recoveryId: string;
  name: string;
  lastSeenAt: string;
}

export type BootstrapResult =
  | { status: "authenticated"; user: ApiUser }
  | { status: "recovery-pending"; candidate: RecoveryCandidate; fingerprint: string }
  | { status: "unauthenticated"; fingerprint: string };

// On app load: reuse a stored session (registered or guest) if we have one.
// Otherwise check whether the server recognizes this device+IP as a recent
// guest — surfaced to the caller for an explicit confirm/decline prompt,
// never auto-restored. If neither applies, the caller is responsible for
// showing the login screen; guest mode only starts when the person
// explicitly chooses "Continue as guest" (see continueAsGuest below).
export async function bootstrapSession(): Promise<BootstrapResult> {
  if (hasStoredSession()) {
    try {
      const user = await getMe();
      return { status: "authenticated", user };
    } catch {
      clearTokens();
    }
  }

  const fingerprint = getFingerprint();
  const { candidate } = await checkGuestRecovery(fingerprint).catch(() => ({ candidate: null }));
  if (candidate) {
    return { status: "recovery-pending", candidate, fingerprint };
  }

  return { status: "unauthenticated", fingerprint };
}

export async function continueAsGuest(fingerprint: string): Promise<ApiUser> {
  const { user, tokens } = await createGuest(fingerprint);
  storeTokens(tokens);
  return user;
}

export async function acceptRecovery(recoveryId: string): Promise<ApiUser> {
  const { user, tokens } = await confirmGuestRecovery(recoveryId);
  storeTokens(tokens);
  return user;
}

// Declining just clears the pending candidate server-side — it does NOT
// auto-create a new guest. The caller falls back to the login screen so
// "continue as guest" stays an explicit choice either way.
export async function declineRecovery(recoveryId: string): Promise<void> {
  await declineGuestRecovery(recoveryId).catch(() => {});
}
