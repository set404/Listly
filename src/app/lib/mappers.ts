import { formatDistanceToNow } from "date-fns";
import { hy as hyLocale } from "date-fns/locale";
import { Capacitor } from "@capacitor/core";
import { Share as CapShare } from "@capacitor/share";
import type {
  ApiList, ApiListItem, ApiBonusCard, ApiWishlist, ApiWishlistSummary,
  ApiGroup, ApiGroupSummary, ApiExpense, ApiSettlement, ApiExpenseGroup, ApiExpenseGroupSummary,
} from "./api";
import type {
  ListItem, ListSummary, BonusCardVM, Wishlist, Group, ExpenseVM, SettlementVM, ExpenseGroup, SettleSuggestion,
} from "../types";

// The native app's WebView serves local assets from https://localhost, not
// a real address anyone else can open — a share link built from
// window.location there would be useless. Use the deployed web app's
// actual origin for the link in that case; on web, the current origin is
// already correct (and lets local dev builds share a working link too).
const PUBLIC_WEB_ORIGIN = "https://set404.github.io/Listly/";

export function getWishlistShareUrl(shareToken: string): string {
  const base = Capacitor.isNativePlatform()
    ? PUBLIC_WEB_ORIGIN
    : `${window.location.origin}${window.location.pathname}`;
  return `${base}#/w/${shareToken}`;
}

// In the native app, navigator.share is unreliable in the WebView (usually
// just missing), so the "Share" button silently fell back to a copy. The
// Capacitor plugin talks to the OS share sheet directly instead. Web keeps
// using the Web Share API (falling back to clipboard) exactly as before.
export async function shareWishlistLink(name: string, url: string): Promise<"shared" | "copied" | "cancelled"> {
  const title = `${name} — a Listly wishlist`;
  if (Capacitor.isNativePlatform()) {
    try {
      await CapShare.share({ title, url });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  await navigator.clipboard.writeText(url).catch(() => {});
  return "copied";
}

// ─── API → view-model mapping ──────────────────────────────────────────────

export function mapItem(i: ApiListItem): ListItem {
  return {
    id: i.id,
    clientId: i.id,
    text: i.text,
    imageUrl: i.imageUrl ?? undefined,
    price: i.price ?? undefined,
    currency: i.currency ?? undefined,
    completed: i.completed,
    completedAt: i.completedAt ? Date.parse(i.completedAt) : undefined,
  };
}

export function mapList(l: ApiList): ListSummary {
  return {
    id: l.id,
    name: l.name,
    createdAt: Date.parse(l.createdAt),
    items: l.items.map(mapItem),
  };
}

// Puts the items named in `orderedIds` first, in that order, followed by
// every other item unchanged — used for the manual-reorder drag gesture,
// which only ever reorders the active (incomplete) subset of a list.
export function reorderItemsArray(items: ListItem[], orderedIds: string[]): ListItem[] {
  const byId = new Map(items.map(i => [i.id, i]));
  const reordered = orderedIds.map(id => byId.get(id)).filter((i): i is ListItem => !!i);
  const orderedIdSet = new Set(orderedIds);
  const rest = items.filter(i => !orderedIdSet.has(i.id));
  return [...reordered, ...rest];
}

export function mapBonusCard(c: ApiBonusCard): BonusCardVM {
  return { id: c.id, name: c.name, imageUrl: c.imageUrl };
}

// Lightweight — from the wishlists-tab list fetch. shareToken/list are
// filled in once the full detail loads (detailLoaded flips to true then).
export function mapWishlistSummary(w: ApiWishlistSummary): Wishlist {
  return {
    id: w.id,
    name: w.name,
    emoji: w.emoji,
    shareToken: null,
    list: null,
    itemCount: w.itemCount,
    doneCount: w.doneCount,
    detailLoaded: false,
  };
}

export function mapWishlist(w: ApiWishlist): Wishlist {
  const list = w.list ? mapList(w.list) : null;
  return {
    id: w.id,
    name: w.name,
    emoji: w.emoji,
    shareToken: w.shareToken,
    list,
    itemCount: list?.items.length ?? 0,
    doneCount: list ? list.items.filter(i => i.completed).length : 0,
    detailLoaded: true,
  };
}

// Lightweight — from the groups-tab list fetch. lists/bonusCards are filled
// in once the full detail loads (detailLoaded flips to true then).
export function mapGroupSummary(g: ApiGroupSummary, currentUserId: string): Group {
  return {
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    inviteCode: g.inviteCode,
    defaultCurrency: g.defaultCurrency,
    bonusCards: [],
    myRole: g.myRole,
    members: g.members.map(m => ({
      id: m.id, name: m.name, color: m.color, isCurrentUser: m.id === currentUserId,
    })),
    lists: [],
    listCount: g.listCount,
    activeListSummary: g.activeList,
    itemCounts: g.itemCounts,
    detailLoaded: false,
  };
}

export function mapGroup(g: ApiGroup, currentUserId: string): Group {
  const lists = g.lists.map(mapList);
  const allItems = lists.flatMap(l => l.items);
  const activeListRow = lists.length > 0 ? lists[lists.length - 1] : null;
  return {
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    inviteCode: g.inviteCode,
    defaultCurrency: g.defaultCurrency,
    bonusCards: g.bonusCards.map(mapBonusCard),
    myRole: g.myRole,
    members: g.members.map(m => ({
      id: m.id, name: m.name, color: m.color, isCurrentUser: m.id === currentUserId,
    })),
    lists,
    listCount: lists.length,
    activeListSummary: activeListRow
      ? { id: activeListRow.id, name: activeListRow.name, itemCount: activeListRow.items.length, doneCount: activeListRow.items.filter(i => i.completed).length }
      : null,
    itemCounts: { total: allItems.length, done: allItems.filter(i => i.completed).length },
    detailLoaded: true,
  };
}

export function mapExpense(e: ApiExpense): ExpenseVM {
  return {
    id: e.id,
    description: e.description,
    amount: e.amount,
    currency: e.currency,
    paidById: e.paidById,
    createdAt: Date.parse(e.createdAt),
    splits: e.splits.map(s => ({ userId: s.userId, amount: s.amount })),
  };
}

export function mapSettlement(s: ApiSettlement): SettlementVM {
  return {
    id: s.id,
    fromUserId: s.fromUserId,
    toUserId: s.toUserId,
    amount: s.amount,
    currency: s.currency,
    createdAt: Date.parse(s.createdAt),
  };
}

// Lightweight — from the expense-groups-tab list fetch. expenses/settlements
// are filled in once the full detail loads (detailLoaded flips to true then).
export function mapExpenseGroupSummary(g: ApiExpenseGroupSummary, currentUserId: string): ExpenseGroup {
  return {
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    inviteCode: g.inviteCode,
    defaultCurrency: g.defaultCurrency,
    myRole: g.myRole,
    members: g.members.map(m => ({
      id: m.id, name: m.name, color: m.color, isCurrentUser: m.id === currentUserId,
    })),
    expenses: [],
    settlements: [],
    balanceSummary: g.balanceSummary,
    detailLoaded: false,
  };
}

export function mapExpenseGroup(g: ApiExpenseGroup, currentUserId: string): ExpenseGroup {
  const members = g.members.map(m => ({
    id: m.id, name: m.name, color: m.color, isCurrentUser: m.id === currentUserId,
  }));
  const expenses = g.expenses.map(mapExpense);
  const settlements = g.settlements.map(mapSettlement);
  const group: ExpenseGroup = {
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    inviteCode: g.inviteCode,
    defaultCurrency: g.defaultCurrency,
    myRole: g.myRole,
    members,
    expenses,
    settlements,
    balanceSummary: null,
    detailLoaded: true,
  };
  const me = members.find(m => m.isCurrentUser);
  const mine = me ? (computeExpenseBalances(group)[me.id] ?? {}) : {};
  const entry = Object.entries(mine).find(([, amt]) => Math.abs(amt) > 0.005);
  const involved = expenses.some(e => e.paidById === me?.id || e.splits.some(s => s.userId === me?.id));
  group.balanceSummary = entry
    ? (entry[1] > 0 ? { kind: "owed", amount: entry[1], currency: entry[0] } : { kind: "owes", amount: -entry[1], currency: entry[0] })
    : (involved ? { kind: "settled" } : null);
  return group;
}

// Net balance per member per currency: what they paid across all expenses
// (plus settlements they sent), minus their own share of every expense's
// split (plus settlements they received) — positive means the group owes
// them, negative means they owe the group. Not pairwise "who owes whom"
// (a real simplification vs. e.g. Splitwise's debt-graph reduction), just an
// overall per-person total, which is enough for a first version. A
// settlement (a real-world payment from one member to another) moves the
// same amount from the sender's debt into the receiver's credit, exactly
// like an expense the sender "paid" and the receiver alone "owes".
export function computeExpenseBalances(group: ExpenseGroup): Record<string, Record<string, number>> {
  const balances: Record<string, Record<string, number>> = {};
  for (const m of group.members) balances[m.id] = {};
  for (const e of group.expenses) {
    balances[e.paidById] ??= {};
    balances[e.paidById][e.currency] = (balances[e.paidById][e.currency] ?? 0) + e.amount;
    for (const s of e.splits) {
      balances[s.userId] ??= {};
      balances[s.userId][e.currency] = (balances[s.userId][e.currency] ?? 0) - s.amount;
    }
  }
  for (const s of group.settlements) {
    balances[s.fromUserId] ??= {};
    balances[s.fromUserId][s.currency] = (balances[s.fromUserId][s.currency] ?? 0) + s.amount;
    balances[s.toUserId] ??= {};
    balances[s.toUserId][s.currency] = (balances[s.toUserId][s.currency] ?? 0) - s.amount;
  }
  return balances;
}

// Reduces each currency's net balances down to a minimal set of suggested
// transfers ("who pays whom how much") via the standard greedy debt-
// simplification: repeatedly match the biggest debtor against the biggest
// creditor for the amount they overlap on. This can (correctly) suggest a
// transfer between two people who never shared an expense directly — it's
// the smallest set of payments that brings the whole group to zero, not a
// literal replay of who-paid-for-what.
export function computeSettleUpSuggestions(group: ExpenseGroup): SettleSuggestion[] {
  const balances = computeExpenseBalances(group);
  const currencies = new Set<string>();
  for (const m of group.members) for (const c of Object.keys(balances[m.id] ?? {})) currencies.add(c);

  const suggestions: SettleSuggestion[] = [];
  for (const currency of currencies) {
    const creditors = group.members
      .map(m => ({ userId: m.id, amount: balances[m.id]?.[currency] ?? 0 }))
      .filter(e => e.amount > 0.005)
      .sort((a, b) => b.amount - a.amount);
    const debtors = group.members
      .map(m => ({ userId: m.id, amount: -(balances[m.id]?.[currency] ?? 0) }))
      .filter(e => e.amount > 0.005)
      .sort((a, b) => b.amount - a.amount);

    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const amount = Math.round(Math.min(debtor.amount, creditor.amount) * 100) / 100;
      if (amount > 0.005) {
        suggestions.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amount, currency });
      }
      debtor.amount -= amount;
      creditor.amount -= amount;
      if (debtor.amount <= 0.005) i++;
      if (creditor.amount <= 0.005) j++;
    }
  }
  return suggestions;
}

export function formatRelativeDate(timestamp: number, locale: string): string {
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true, locale: locale === "hy" ? hyLocale : undefined });
}
