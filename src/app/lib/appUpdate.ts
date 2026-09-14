import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";

export interface UpdateInfo {
  version: string;
  versionCode: number;
  url: string;
  notes: string | null;
}

// The build-android.yml workflow tags every release it publishes with the
// CI run number and uploads the APK as a release asset — so the latest
// GitHub Release IS the latest build, with no separate config to keep in
// sync. Public repo, so this needs no auth token.
const LATEST_RELEASE_URL = "https://api.github.com/repos/set404/Listly/releases/latest";

// Persists across launches so a user who dismisses "Update available" isn't
// nagged again on every app open — only when a *newer* build ships.
const DISMISSED_KEY = "listly_dismissed_update_version_code";

interface GithubRelease {
  tag_name: string;
  body: string | null;
  assets: { name: string; browser_download_url: string }[];
}

// Native Android only: there's no update mechanism on web (every page load
// already serves the latest build) or iOS (no direct-APK install flow here).
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (Capacitor.getPlatform() !== "android") return null;

  const release = await fetch(LATEST_RELEASE_URL, {
    headers: { Accept: "application/vnd.github+json" },
  })
    .then((res) => (res.ok ? (res.json() as Promise<GithubRelease>) : null))
    .catch(() => null);
  if (!release) return null;

  // Tag name is just the CI run number (see build-android.yml) — plain
  // numeric comparison against the running app's versionCode.
  const remoteVersionCode = Number(release.tag_name);
  const asset = release.assets.find((a) => a.name.endsWith(".apk"));
  if (!Number.isFinite(remoteVersionCode) || !asset) return null;

  const info = await CapApp.getInfo();
  const currentCode = Number(info.build);
  if (!Number.isFinite(currentCode) || currentCode >= remoteVersionCode) return null;

  const dismissed = Number(localStorage.getItem(DISMISSED_KEY) ?? "0");
  if (remoteVersionCode <= dismissed) return null;

  return { version: release.tag_name, versionCode: remoteVersionCode, url: asset.browser_download_url, notes: release.body };
}

export function dismissUpdate(versionCode: number): void {
  try {
    localStorage.setItem(DISMISSED_KEY, String(versionCode));
  } catch {
    // Private mode / storage disabled — worst case the prompt reappears.
  }
}
