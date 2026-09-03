import type { AvatarColor } from "../components/ui-kit";

// ─── Types (mirrors the server's public shapes) ────────────────────────────

export type GroupRole = "ADMIN" | "MEMBER";
export type UserKind = "REGISTERED" | "GUEST";

export interface ApiUser {
  id: string;
  kind: UserKind;
  email: string | null;
  name: string;
  avatarColor: AvatarColor;
}

export interface ApiMember {
  id: string;
  name: string;
  color: AvatarColor;
  role: GroupRole;
}

export interface ApiListItem {
  id: string;
  listId: string;
  text: string;
  imageUrl: string | null;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  createdById: string | null;
}

export interface ApiList {
  id: string;
  groupId: string;
  name: string;
  createdAt: string;
  items: ApiListItem[];
}

export interface ApiBonusCard {
  id: string;
  groupId: string;
  name: string;
  imageUrl: string;
  createdAt: string;
}

export interface ApiGroup {
  id: string;
  name: string;
  emoji: string;
  inviteCode: string;
  bonusCards: ApiBonusCard[];
  myRole: GroupRole;
  members: ApiMember[];
  lists: ApiList[];
}

export interface ApiWishlist {
  id: string;
  name: string;
  emoji: string;
  shareToken: string | null;
  list: ApiList | null;
}

export interface ApiPublicWishlist {
  name: string;
  emoji: string;
  list: ApiList | null;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// ─── Token storage ──────────────────────────────────────────────────────────

const ACCESS_KEY = "listly_access_token";
const REFRESH_KEY = "listly_refresh_token";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function storeTokens(tokens: TokenPair): void {
  localStorage.setItem(ACCESS_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function hasStoredSession(): boolean {
  return Boolean(getAccessToken());
}

// ─── Fetch wrapper ──────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        storeTokens(data.tokens);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

async function apiFetch<T>(path: string, opts: RequestInit = {}, retry = true): Promise<T> {
  const accessToken = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}/api${path}`, { ...opts, headers });

  if (res.status === 401 && retry) {
    const refreshed = await tryRefresh();
    if (refreshed) return apiFetch<T>(path, opts, false);
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // no JSON body
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export function register(email: string, password: string, name: string) {
  return apiFetch<{ user: ApiUser; tokens: TokenPair }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
}

export function login(email: string, password: string) {
  return apiFetch<{ user: ApiUser; tokens: TokenPair }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    await apiFetch("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {});
  }
  clearTokens();
}

export function getMe() {
  return apiFetch<ApiUser>("/users/me");
}

export function registerPushToken(token: string, platform: string) {
  return apiFetch<void>("/users/me/push-token", {
    method: "POST",
    body: JSON.stringify({ token, platform }),
  });
}

// ─── Guest ──────────────────────────────────────────────────────────────────

export function createGuest(fingerprint: string, name?: string) {
  return apiFetch<{ user: ApiUser; tokens: TokenPair }>("/guest/create", {
    method: "POST",
    body: JSON.stringify({ fingerprint, name }),
  });
}

export function checkGuestRecovery(fingerprint: string) {
  return apiFetch<{ candidate: { recoveryId: string; name: string; lastSeenAt: string } | null }>(
    "/guest/recover/check",
    { method: "POST", body: JSON.stringify({ fingerprint }) },
  );
}

export function confirmGuestRecovery(recoveryId: string) {
  return apiFetch<{ user: ApiUser; tokens: TokenPair }>("/guest/recover/confirm", {
    method: "POST",
    body: JSON.stringify({ recoveryId }),
  });
}

export function declineGuestRecovery(recoveryId: string) {
  return apiFetch<void>("/guest/recover/decline", {
    method: "POST",
    body: JSON.stringify({ recoveryId }),
  });
}

// ─── Groups ─────────────────────────────────────────────────────────────────

export function listGroups() {
  return apiFetch<ApiGroup[]>("/groups");
}

export function createGroup(name: string, emoji: string) {
  return apiFetch<ApiGroup>("/groups", {
    method: "POST",
    body: JSON.stringify({ name, emoji }),
  });
}

export function joinGroup(inviteCode: string) {
  return apiFetch<ApiGroup>("/groups/join", {
    method: "POST",
    body: JSON.stringify({ inviteCode }),
  });
}

export function getGroup(groupId: string) {
  return apiFetch<ApiGroup>(`/groups/${groupId}`);
}

export function leaveGroup(groupId: string) {
  return apiFetch<void>(`/groups/${groupId}/leave`, { method: "DELETE" });
}

export function removeMember(groupId: string, userId: string) {
  return apiFetch<void>(`/groups/${groupId}/members/${userId}`, { method: "DELETE" });
}

export function regenerateInvite(groupId: string) {
  return apiFetch<{ inviteCode: string }>(`/groups/${groupId}/invite/regenerate`, { method: "POST" });
}

export function addBonusCard(groupId: string, name: string, imageUrl: string) {
  return apiFetch<ApiBonusCard>(`/groups/${groupId}/bonus-cards`, {
    method: "POST",
    body: JSON.stringify({ name, imageUrl }),
  });
}

export function deleteBonusCard(groupId: string, cardId: string) {
  return apiFetch<void>(`/groups/${groupId}/bonus-cards/${cardId}`, { method: "DELETE" });
}

export function createList(groupId: string, name: string) {
  return apiFetch<ApiList>(`/groups/${groupId}/lists`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function deleteList(groupId: string, listId: string) {
  return apiFetch<void>(`/groups/${groupId}/lists/${listId}`, { method: "DELETE" });
}

export function addItem(listId: string, text: string, imageUrl?: string) {
  return apiFetch<ApiListItem>(`/lists/${listId}/items`, {
    method: "POST",
    body: JSON.stringify({ text, imageUrl }),
  });
}

export function updateItem(
  listId: string,
  itemId: string,
  changes: { completed?: boolean; text?: string; imageUrl?: string },
) {
  return apiFetch<ApiListItem>(`/lists/${listId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export function deleteItem(listId: string, itemId: string) {
  return apiFetch<void>(`/lists/${listId}/items/${itemId}`, { method: "DELETE" });
}

// ─── Wishlists ──────────────────────────────────────────────────────────────

export function listWishlists() {
  return apiFetch<ApiWishlist[]>("/wishlists");
}

export function createWishlist(name: string, emoji: string) {
  return apiFetch<ApiWishlist>("/wishlists", {
    method: "POST",
    body: JSON.stringify({ name, emoji }),
  });
}

export function getWishlist(wishlistId: string) {
  return apiFetch<ApiWishlist>(`/wishlists/${wishlistId}`);
}

export function deleteWishlist(wishlistId: string) {
  return apiFetch<void>(`/wishlists/${wishlistId}`, { method: "DELETE" });
}

export function regenerateWishlistShareLink(wishlistId: string) {
  return apiFetch<{ shareToken: string }>(`/wishlists/${wishlistId}/share/regenerate`, { method: "POST" });
}

// No auth token needed — apiFetch omits the Authorization header when
// signed out, and the server route ignores it entirely either way.
export function getPublicWishlist(shareToken: string) {
  return apiFetch<ApiPublicWishlist>(`/wishlists/public/${shareToken}`);
}
