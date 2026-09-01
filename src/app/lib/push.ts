import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { registerPushToken } from "./api";

// Native-only for now (web push is a separate mechanism — service worker +
// VAPID — not wired up yet). No-ops silently in the browser.
//
// Call this on every login (not just the first), including switching to a
// different guest/account on the same device: registerPushToken() reads the
// current access token at send time, so a fresh register() call re-points
// this device's token at whoever is now signed in. Listeners are attached
// once and reused across logins rather than piling up.
let listenersAttached = false;

export async function initPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  if (!listenersAttached) {
    listenersAttached = true;
    PushNotifications.addListener("registration", (token) => {
      registerPushToken(token.value, Capacitor.getPlatform()).catch(() => {});
    });
    PushNotifications.addListener("registrationError", (err) => {
      console.error("Push registration failed:", err);
    });
  }

  const current = await PushNotifications.checkPermissions();
  let status = current.receive;
  if (status === "prompt" || status === "prompt-with-rationale") {
    status = (await PushNotifications.requestPermissions()).receive;
  }
  if (status !== "granted") return;

  await PushNotifications.register();
}
