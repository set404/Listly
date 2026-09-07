import { GoogleSignIn } from "@capawesome/capacitor-google-sign-in";
import { Capacitor } from "@capacitor/core";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

// On Web the plugin can't use a native account picker — it redirects the
// whole page to Google and back. `redirectUrl` must be registered as an
// authorized redirect URI for this OAuth client in Google Cloud Console.
function getWebRedirectUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  if (!CLIENT_ID) throw new Error("Google sign-in is not configured (missing VITE_GOOGLE_CLIENT_ID)");
  await GoogleSignIn.initialize({
    clientId: CLIENT_ID,
    ...(Capacitor.getPlatform() === "web" ? { redirectUrl: getWebRedirectUrl() } : {}),
  });
  initialized = true;
}

export async function signInWithGoogle(): Promise<string> {
  await ensureInitialized();
  const result = await GoogleSignIn.signIn();
  if (!result.idToken) throw new Error("Google sign-in did not return an ID token");
  return result.idToken;
}

// On Web, signIn() redirects away and never resolves — Google sends the
// user back to `redirectUrl` with the result in the URL fragment. Call this
// on app load to pick that result up and finish the sign-in.
export function hasPendingGoogleRedirect(): boolean {
  return Capacitor.getPlatform() === "web" && /(?:^|[#&])id_token=/.test(window.location.hash);
}

export async function completeGoogleRedirectSignIn(): Promise<string> {
  await ensureInitialized();
  const result = await GoogleSignIn.handleRedirectCallback();
  if (!result.idToken) throw new Error("Google sign-in did not return an ID token");
  return result.idToken;
}
