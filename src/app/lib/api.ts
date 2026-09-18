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
  price: number | null;
  currency: string | null;
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
  defaultCurrency: string;
  bonusCards: ApiBonusCard[];
  myRole: GroupRole;
  members: ApiMember[];
  lists: ApiList[];
}

// Card-level shape returned by GET /groups (the tab list) — no item bodies,
// just enough to render each card. GET /groups/:id returns the full
// ApiGroup above once a specific group is actually opened.
export interface ApiGroupSummary {
  id: string;
  name: string;
  emoji: string;
  inviteCode: string;
  defaultCurrency: string;
  myRole: GroupRole;
  members: ApiMember[];
  listCount: number;
  activeList: { id: string; name: string; itemCount: number; doneCount: number } | null;
  itemCounts: { total: number; done: number };
}

export interface ApiWishlist {
  id: string;
  name: string;
  emoji: string;
  shareToken: string | null;
  list: ApiList | null;
}

// Card-level shape returned by GET /wishlists — item counts only.
export interface ApiWishlistSummary {
  id: string;
  name: string;
  emoji: string;
  itemCount: number;
  doneCount: number;
}

export interface ApiPublicWishlist {
  name: string;
  emoji: string;
  list: ApiList | null;
}

export interface ApiExpenseSplit {
  userId: string;
  amount: number;
}

export interface ApiExpense {
  id: string;
  description: string;
  amount: number;
  currency: string;
  paidById: string;
  createdAt: string;
  createdById: string | null;
  splits: ApiExpenseSplit[];
}

export interface ApiSettlement {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
  createdAt: string;
  createdById: string | null;
}

export interface ApiExpenseGroup {
  id: string;
  name: string;
  emoji: string;
  inviteCode: string;
  defaultCurrency: string;
  myRole: GroupRole;
  members: ApiMember[];
  expenses: ApiExpense[];
  settlements: ApiSettlement[];
}

export type ApiBalanceSummary =
  | { kind: "owed"; amount: number; currency: string }
  | { kind: "owes"; amount: number; currency: string }
  | { kind: "settled" }
  | null;

// Card-level shape returned by GET /expense-groups — just the viewer's own
// net balance, not every expense/split/settlement for every member.
export interface ApiExpenseGroupSummary {
  id: string;
  name: string;
  emoji: string;
  inviteCode: string;
  defaultCurrency: string;
  myRole: GroupRole;
  members: ApiMember[];
  balanceSummary: ApiBalanceSummary;
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

export function loginWithGoogle(idToken: string) {
  return apiFetch<{ user: ApiUser; tokens: TokenPair }>("/auth/google", {
    method: "POST",
    body: JSON.stringify({ idToken }),
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
  return apiFetch<ApiGroupSummary[]>("/groups");
}

export function createGroup(name: string, emoji: string, defaultCurrency?: string) {
  return apiFetch<ApiGroup>("/groups", {
    method: "POST",
    body: JSON.stringify({ name, emoji, defaultCurrency }),
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

export function updateGroup(groupId: string, changes: { name?: string; emoji?: string; defaultCurrency?: string }) {
  return apiFetch<ApiGroup>(`/groups/${groupId}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export function leaveGroup(groupId: string) {
  return apiFetch<void>(`/groups/${groupId}/leave`, { method: "DELETE" });
}

export function deleteGroup(groupId: string) {
  return apiFetch<void>(`/groups/${groupId}`, { method: "DELETE" });
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

export function addItem(listId: string, text: string, imageUrl?: string, price?: number, currency?: string) {
  return apiFetch<ApiListItem>(`/lists/${listId}/items`, {
    method: "POST",
    body: JSON.stringify({ text, imageUrl, price, currency }),
  });
}

export function updateItem(
  listId: string,
  itemId: string,
  changes: { completed?: boolean; text?: string; imageUrl?: string; price?: number | null; currency?: string },
) {
  return apiFetch<ApiListItem>(`/lists/${listId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export function deleteItem(listId: string, itemId: string) {
  return apiFetch<void>(`/lists/${listId}/items/${itemId}`, { method: "DELETE" });
}

// itemIds may be any subset of the list's items (only the active ones are
// ever reordered) — the server places them first, in this order, ahead of
// everything else.
export function reorderItems(listId: string, itemIds: string[]) {
  return apiFetch<void>(`/lists/${listId}/items/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ itemIds }),
  });
}

// ─── Wishlists ──────────────────────────────────────────────────────────────

export function listWishlists() {
  return apiFetch<ApiWishlistSummary[]>("/wishlists");
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

export function updateWishlist(wishlistId: string, changes: { name?: string; emoji?: string }) {
  return apiFetch<ApiWishlist>(`/wishlists/${wishlistId}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
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

// ─── Expense groups ─────────────────────────────────────────────────────────

export function listExpenseGroups() {
  return apiFetch<ApiExpenseGroupSummary[]>("/expense-groups");
}

export function createExpenseGroup(name: string, emoji: string, defaultCurrency?: string) {
  return apiFetch<ApiExpenseGroup>("/expense-groups", {
    method: "POST",
    body: JSON.stringify({ name, emoji, defaultCurrency }),
  });
}

export function joinExpenseGroup(inviteCode: string) {
  return apiFetch<ApiExpenseGroup>("/expense-groups/join", {
    method: "POST",
    body: JSON.stringify({ inviteCode }),
  });
}

export function getExpenseGroup(groupId: string) {
  return apiFetch<ApiExpenseGroup>(`/expense-groups/${groupId}`);
}

export function updateExpenseGroup(
  groupId: string,
  changes: { name?: string; emoji?: string; defaultCurrency?: string },
) {
  return apiFetch<ApiExpenseGroup>(`/expense-groups/${groupId}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export function deleteExpenseGroup(groupId: string) {
  return apiFetch<void>(`/expense-groups/${groupId}`, { method: "DELETE" });
}

export function leaveExpenseGroup(groupId: string) {
  return apiFetch<void>(`/expense-groups/${groupId}/leave`, { method: "DELETE" });
}

export function listExpenseGroupMembers(groupId: string) {
  return apiFetch<ApiMember[]>(`/expense-groups/${groupId}/members`);
}

export function removeExpenseGroupMember(groupId: string, userId: string) {
  return apiFetch<void>(`/expense-groups/${groupId}/members/${userId}`, { method: "DELETE" });
}

export function regenerateExpenseGroupInvite(groupId: string) {
  return apiFetch<{ inviteCode: string }>(`/expense-groups/${groupId}/invite/regenerate`, { method: "POST" });
}

export function addExpense(
  groupId: string,
  input: { description: string; amount: number; currency?: string; paidById: string; participantIds: string[] },
) {
  return apiFetch<ApiExpense>(`/expense-groups/${groupId}/expenses`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateExpense(
  groupId: string,
  expenseId: string,
  changes: { description?: string; amount?: number; currency?: string; paidById?: string; participantIds?: string[] },
) {
  return apiFetch<ApiExpense>(`/expense-groups/${groupId}/expenses/${expenseId}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export function deleteExpense(groupId: string, expenseId: string) {
  return apiFetch<void>(`/expense-groups/${groupId}/expenses/${expenseId}`, { method: "DELETE" });
}

export function addSettlement(
  groupId: string,
  input: { fromUserId: string; toUserId: string; amount: number; currency?: string },
) {
  return apiFetch<ApiSettlement>(`/expense-groups/${groupId}/settlements`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteSettlement(groupId: string, settlementId: string) {
  return apiFetch<void>(`/expense-groups/${groupId}/settlements/${settlementId}`, { method: "DELETE" });
}
