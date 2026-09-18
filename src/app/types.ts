import type { Member } from "./components/ui-kit";
import type { GroupRole, ApiBalanceSummary } from "./lib/api";

export type JoinStatus = "idle" | "loading" | "success" | "error";

export interface ListItem {
  id: string;
  clientId: string;
  text: string;
  imageUrl?: string;
  price?: number;
  currency?: string;
  completed: boolean;
  completedAt?: number;
}

export interface ListSummary {
  id: string;
  name: string;
  createdAt: number;
  items: ListItem[];
}

export interface BonusCardVM {
  id: string;
  name: string;
  imageUrl: string;
}

// The subset of a Group's fields that MembersScreen/InviteScreen/SettingsScreen
// actually touch — widening those screens' props to this instead of the full
// STANDARD-only Group interface lets ExpenseGroup satisfy it too, so member
// management, invites, and settings are shared between both group kinds.
export interface GroupIdentity {
  id: string;
  name: string;
  emoji: string;
  members: Member[];
  inviteCode: string;
  myRole: GroupRole;
}

// listCount/activeList/itemCounts come from the lightweight groups-tab
// fetch and are always present; lists/bonusCards start empty and are only
// populated once this specific group's full detail has been fetched
// (detailLoaded flips to true then) — see the "fetch full detail on enter"
// effect. Screens that need the real list contents must check
// detailLoaded first instead of assuming lists is already right.
export interface Group extends GroupIdentity {
  lists: ListSummary[];
  defaultCurrency: string;
  bonusCards: BonusCardVM[];
  listCount: number;
  activeListSummary: { id: string; name: string; itemCount: number; doneCount: number } | null;
  itemCounts: { total: number; done: number };
  detailLoaded: boolean;
}

// itemCount/doneCount come from the lightweight wishlists-tab fetch; list
// starts null and is only populated once this wishlist's full detail has
// been fetched (detailLoaded flips to true then).
export interface Wishlist {
  id: string;
  name: string;
  emoji: string;
  shareToken: string | null;
  list: ListSummary | null;
  itemCount: number;
  doneCount: number;
  detailLoaded: boolean;
}

export interface ExpenseSplitVM {
  userId: string;
  amount: number;
}

export interface ExpenseVM {
  id: string;
  description: string;
  amount: number;
  currency: string;
  paidById: string;
  createdAt: number;
  splits: ExpenseSplitVM[];
}

export interface SettlementVM {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
  createdAt: number;
}

// balanceSummary comes from the lightweight expense-groups-tab fetch and is
// always present; expenses/settlements start empty and are only populated
// once this specific group's full detail has been fetched (detailLoaded
// flips to true then).
export interface ExpenseGroup extends GroupIdentity {
  defaultCurrency: string;
  expenses: ExpenseVM[];
  settlements: SettlementVM[];
  balanceSummary: ApiBalanceSummary;
  detailLoaded: boolean;
}

export interface SettleSuggestion {
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
}
