import { useState, useEffect, useRef } from "react";
import type { TouchEvent as ReactTouchEvent, TouchList as ReactTouchList } from "react";
import { useNavigate, useLocation, useNavigationType } from "react-router";
import { motion, AnimatePresence, LayoutGroup, useMotionValue, animate, Reorder, useDragControls } from "motion/react";
import { useTranslation } from "react-i18next";
import { format, formatDistanceToNow } from "date-fns";
import { hy as hyLocale } from "date-fns/locale";
import {
  Check, Plus, Copy, Share2, RefreshCw, ChevronLeft, ChevronRight, ChevronDown,
  Settings, Users, LogOut, UserPlus, Home, UserRound, Gift, Pencil,
  Loader2, ShoppingBag, CheckCircle2, Trash2, ImagePlus, X, GripVertical, DollarSign, Wallet, Receipt, ArrowRightLeft,
} from "lucide-react";
import { Btn, Field, Sheet, Confirm, Toast, Avatar, SAFE_AREA_TOP, SAFE_AREA_BOTTOM, type Member, type ThemeMode } from "./components/ui-kit";
import { LoginScreen } from "./components/LoginScreen";
import { RegisterScreen } from "./components/RegisterScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { GuestRecoveryPrompt } from "./components/GuestRecoveryPrompt";
import {
  bootstrapSession, continueAsGuest, acceptRecovery, declineRecovery,
  type RecoveryCandidate,
} from "./lib/auth";
import {
  ApiError, type ApiUser, type ApiGroup, type ApiList, type ApiListItem, type ApiBonusCard, type GroupRole,
  type ApiWishlist, type ApiPublicWishlist, type ApiExpense, type ApiExpenseGroup, type ApiSettlement,
  loginWithGoogle as apiLoginWithGoogle,
  storeTokens,
  listGroups as apiListGroups,
  getGroup as apiGetGroup,
  createGroup as apiCreateGroup,
  updateGroup as apiUpdateGroup,
  joinGroup as apiJoinGroup,
  leaveGroup as apiLeaveGroup,
  deleteGroup as apiDeleteGroup,
  removeMember as apiRemoveMember,
  regenerateInvite as apiRegenerateInvite,
  addBonusCard as apiAddBonusCard,
  deleteBonusCard as apiDeleteBonusCard,
  createList as apiCreateList,
  deleteList as apiDeleteList,
  addItem as apiAddItem,
  updateItem as apiUpdateItem,
  reorderItems as apiReorderItems,
  deleteItem as apiDeleteItem,
  logout as apiLogout,
  listWishlists as apiListWishlists,
  createWishlist as apiCreateWishlist,
  updateWishlist as apiUpdateWishlist,
  deleteWishlist as apiDeleteWishlist,
  regenerateWishlistShareLink as apiRegenerateWishlistShareLink,
  getPublicWishlist as apiGetPublicWishlist,
  listExpenseGroups as apiListExpenseGroups,
  createExpenseGroup as apiCreateExpenseGroup,
  joinExpenseGroup as apiJoinExpenseGroup,
  updateExpenseGroup as apiUpdateExpenseGroup,
  deleteExpenseGroup as apiDeleteExpenseGroup,
  leaveExpenseGroup as apiLeaveExpenseGroup,
  removeExpenseGroupMember as apiRemoveExpenseGroupMember,
  regenerateExpenseGroupInvite as apiRegenerateExpenseGroupInvite,
  addExpense as apiAddExpense,
  updateExpense as apiUpdateExpense,
  deleteExpense as apiDeleteExpense,
  addSettlement as apiAddSettlement,
  deleteSettlement as apiDeleteSettlement,
} from "./lib/api";
import { getSocket, connectSocket, disconnectSocket, joinGroupRoom, leaveGroupRoom } from "./lib/socket";
import { CURRENCIES, formatMoney, currencySymbol } from "./lib/currencies";
import { initPushNotifications } from "./lib/push";
import { checkForUpdate, dismissUpdate, type UpdateInfo } from "./lib/appUpdate";
import { hasPendingGoogleRedirect, completeGoogleRedirectSignIn } from "./lib/googleAuth";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Share as CapShare } from "@capacitor/share";

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen =
  | "login" | "register" | "groups" | "profile" | "lists" | "list" | "settings" | "members" | "invite"
  | "wishlists" | "wishlist" | "public-wishlist"
  | "expenseGroups" | "expenseGroup" | "expenseGroupSettings" | "expenseGroupMembers" | "expenseGroupInvite"
  | "unknown";
type TabScreen = "groups" | "expenseGroups" | "wishlists" | "profile";
type JoinStatus = "idle" | "loading" | "success" | "error";

// ─── Route parsing ─────────────────────────────────────────────────────────
//
// The app has no server behind it (it's shipped as a static bundle, and as a
// Capacitor app on Android), so we route entirely on the client with
// HashRouter. Every screen change pushes a real history entry so the browser
// / hardware back button walks backward through actual navigation instead of
// leaving the whole app on a single route.

interface RouteMatch {
  screen: Screen;
  groupId: string | null;
  listId: string | null;
  wishlistId: string | null;
  shareToken: string | null;
}

const EMPTY_ROUTE_IDS = { groupId: null, listId: null, wishlistId: null, shareToken: null };

function parseRoute(pathname: string): RouteMatch {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "login") return { screen: "login", ...EMPTY_ROUTE_IDS };
  if (parts[0] === "register") return { screen: "register", ...EMPTY_ROUTE_IDS };
  if (parts[0] === "profile") return { screen: "profile", ...EMPTY_ROUTE_IDS };
  // Public, unauthenticated share link — a wishlist's read-only view.
  if (parts[0] === "w" && parts[1]) {
    return { screen: "public-wishlist", ...EMPTY_ROUTE_IDS, shareToken: parts[1] };
  }
  if (parts[0] === "wishlists") {
    if (!parts[1]) return { screen: "wishlists", ...EMPTY_ROUTE_IDS };
    return { screen: "wishlist", ...EMPTY_ROUTE_IDS, wishlistId: parts[1] };
  }
  if (parts[0] === "groups") {
    if (!parts[1]) return { screen: "groups", ...EMPTY_ROUTE_IDS };
    const groupId = parts[1];
    const sub = parts[2];
    if (!sub) return { screen: "lists", ...EMPTY_ROUTE_IDS, groupId };
    if (sub === "list" && parts[3]) return { screen: "list", ...EMPTY_ROUTE_IDS, groupId, listId: parts[3] };
    if (sub === "settings") return { screen: "settings", ...EMPTY_ROUTE_IDS, groupId };
    if (sub === "members") return { screen: "members", ...EMPTY_ROUTE_IDS, groupId };
    if (sub === "invite") return { screen: "invite", ...EMPTY_ROUTE_IDS, groupId };
  }
  if (parts[0] === "expense-groups") {
    if (!parts[1]) return { screen: "expenseGroups", ...EMPTY_ROUTE_IDS };
    const groupId = parts[1];
    const sub = parts[2];
    if (!sub) return { screen: "expenseGroup", ...EMPTY_ROUTE_IDS, groupId };
    if (sub === "settings") return { screen: "expenseGroupSettings", ...EMPTY_ROUTE_IDS, groupId };
    if (sub === "members") return { screen: "expenseGroupMembers", ...EMPTY_ROUTE_IDS, groupId };
    if (sub === "invite") return { screen: "expenseGroupInvite", ...EMPTY_ROUTE_IDS, groupId };
  }
  return { screen: "unknown", ...EMPTY_ROUTE_IDS };
}

interface ListItem {
  id: string;
  clientId: string;
  text: string;
  imageUrl?: string;
  price?: number;
  currency?: string;
  completed: boolean;
  completedAt?: number;
}

interface ListSummary {
  id: string;
  name: string;
  createdAt: number;
  items: ListItem[];
}

interface BonusCardVM {
  id: string;
  name: string;
  imageUrl: string;
}

// The subset of a Group's fields that MembersScreen/InviteScreen/SettingsScreen
// actually touch — widening those screens' props to this instead of the full
// STANDARD-only Group interface lets ExpenseGroup satisfy it too, so member
// management, invites, and settings are shared between both group kinds.
interface GroupIdentity {
  id: string;
  name: string;
  emoji: string;
  members: Member[];
  inviteCode: string;
  myRole: GroupRole;
}

interface Group extends GroupIdentity {
  lists: ListSummary[];
  defaultCurrency: string;
  bonusCards: BonusCardVM[];
}

interface Wishlist {
  id: string;
  name: string;
  emoji: string;
  shareToken: string | null;
  list: ListSummary | null;
}

interface ExpenseSplitVM {
  userId: string;
  amount: number;
}

interface ExpenseVM {
  id: string;
  description: string;
  amount: number;
  currency: string;
  paidById: string;
  createdAt: number;
  splits: ExpenseSplitVM[];
}

interface SettlementVM {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
  createdAt: number;
}

interface ExpenseGroup extends GroupIdentity {
  defaultCurrency: string;
  expenses: ExpenseVM[];
  settlements: SettlementVM[];
}

const EMOJIS = ["📋", "🏠", "🍱", "✈️", "🛒", "🎯", "📦", "🌿", "💼", "🎉"];
const WISHLIST_EMOJIS = ["🎁", "🎂", "💍", "🎄", "👶", "🏡", "🎓", "❤️", "✨", "🎉"];
const EXPENSE_EMOJIS = ["💰", "🧾", "💳", "🍽️", "🏠", "✈️", "🎉", "📊", "🤝", "💵"];

// A labeled, full-width dropdown for choosing a group's default currency —
// same closed-state styling as Field's input, with a custom popover menu
// (matching CurrencyPicker below) instead of a native <select>'s OS chrome.
function CurrencyField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-sm font-semibold text-foreground">{label}</label>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-muted/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-base md:text-sm border border-transparent"
        >
          <span className="font-medium">{currencySymbol(value)} {value}</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              className="absolute left-0 right-0 top-full mt-1.5 z-20 bg-card border border-border rounded-2xl shadow-lg py-1 overflow-hidden"
            >
              {CURRENCIES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { onChange(c); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                    c === value ? "text-primary bg-primary/10" : "text-foreground hover:bg-muted"
                  }`}
                >
                  <span className="w-6 text-center flex-shrink-0">{currencySymbol(c)}</span>
                  <span>{c}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Compact currency dropdown for inline use (next to a price field, where
// there's no room for a pill grid) — a small custom popover instead of a
// native <select>, so it matches the app's own card/border/shadow styling
// instead of the OS's default dropdown chrome.
function CurrencyPicker({ value, onChange, className = "" }: {
  value: string; onChange: (v: string) => void; className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className={`relative flex-shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={t("itemRow.currency")}
        title={value}
        className="flex items-center gap-0.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
      >
        {currencySymbol(value)}
        <ChevronDown className="w-3 h-3" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1.5 z-20 w-20 max-h-52 overflow-y-auto bg-card border border-border rounded-xl shadow-lg py-1"
          >
            {CURRENCIES.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setOpen(false); }}
                className={`w-full flex items-center gap-1.5 text-left px-3 py-1.5 text-xs font-semibold transition-colors ${
                  c === value ? "text-primary bg-primary/10" : "text-foreground hover:bg-muted"
                }`}
              >
                <span className="w-4 text-center flex-shrink-0">{currencySymbol(c)}</span>
                <span>{c}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Single-select member dropdown (e.g. "Paid by") — same popover styling as
// CurrencyField, sized to sit next to another field in a row instead of a
// full-width wrapping pill grid.
function MemberField({ label, members, value, onChange }: {
  label: string; members: Member[]; value: string; onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const selected = members.find(m => m.id === value);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-sm font-semibold text-foreground">{label}</label>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-muted/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all border border-transparent"
        >
          {selected && <Avatar m={selected} size="xs" />}
          <span className="flex-1 min-w-0 text-left text-sm font-medium truncate">{selected?.name ?? ""}</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              className="absolute left-0 right-0 top-full mt-1.5 z-20 max-h-56 overflow-y-auto bg-card border border-border rounded-2xl shadow-lg py-1"
            >
              {members.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { onChange(m.id); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 text-sm font-medium transition-colors ${
                    m.id === value ? "text-primary bg-primary/10" : "text-foreground hover:bg-muted"
                  }`}
                >
                  <Avatar m={m} size="xs" />
                  <span className="truncate">{m.name}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Multi-select member dropdown (e.g. "Split between") — same shape as
// MemberField, but selecting toggles membership instead of closing the
// popover, and the closed button summarizes the selection as an avatar
// stack plus a count instead of a single name.
function MemberMultiField({ label, members, value, onChange }: {
  label: string; members: Member[]; value: string[]; onChange: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  }

  const selectedMembers = members.filter(m => value.includes(m.id));

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-sm font-semibold text-foreground">{label}</label>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-muted/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all border border-transparent"
        >
          <div className="flex -space-x-1.5 flex-shrink-0">
            {selectedMembers.slice(0, 3).map(m => (
              <div key={m.id} className="ring-2 ring-muted rounded-full">
                <Avatar m={m} size="xs" />
              </div>
            ))}
          </div>
          <span className="flex-1 min-w-0 text-left text-sm font-medium truncate">
            {selectedMembers.length === members.length && members.length > 0
              ? t("sheets.addExpense.everyone")
              : t("settings.peopleCount", { count: selectedMembers.length })}
          </span>
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              className="absolute left-0 right-0 top-full mt-1.5 z-20 max-h-56 overflow-y-auto bg-card border border-border rounded-2xl shadow-lg py-1"
            >
              {members.map(m => {
                const checked = value.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 text-sm font-medium transition-colors ${
                      checked ? "text-primary bg-primary/10" : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <Avatar m={m} size="xs" />
                    <span className="flex-1 truncate">{m.name}</span>
                    {checked && <Check className="w-4 h-4 flex-shrink-0" />}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// The native app's WebView serves local assets from https://localhost, not
// a real address anyone else can open — a share link built from
// window.location there would be useless. Use the deployed web app's
// actual origin for the link in that case; on web, the current origin is
// already correct (and lets local dev builds share a working link too).
const PUBLIC_WEB_ORIGIN = "https://set404.github.io/Listly/";

function getWishlistShareUrl(shareToken: string): string {
  const base = Capacitor.isNativePlatform()
    ? PUBLIC_WEB_ORIGIN
    : `${window.location.origin}${window.location.pathname}`;
  return `${base}#/w/${shareToken}`;
}

// In the native app, navigator.share is unreliable in the WebView (usually
// just missing), so the "Share" button silently fell back to a copy. The
// Capacitor plugin talks to the OS share sheet directly instead. Web keeps
// using the Web Share API (falling back to clipboard) exactly as before.
async function shareWishlistLink(name: string, url: string): Promise<"shared" | "copied" | "cancelled"> {
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

function mapItem(i: ApiListItem): ListItem {
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

function mapList(l: ApiList): ListSummary {
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
function reorderItemsArray(items: ListItem[], orderedIds: string[]): ListItem[] {
  const byId = new Map(items.map(i => [i.id, i]));
  const reordered = orderedIds.map(id => byId.get(id)).filter((i): i is ListItem => !!i);
  const orderedIdSet = new Set(orderedIds);
  const rest = items.filter(i => !orderedIdSet.has(i.id));
  return [...reordered, ...rest];
}

function mapBonusCard(c: ApiBonusCard): BonusCardVM {
  return { id: c.id, name: c.name, imageUrl: c.imageUrl };
}

function mapWishlist(w: ApiWishlist): Wishlist {
  return {
    id: w.id,
    name: w.name,
    emoji: w.emoji,
    shareToken: w.shareToken,
    list: w.list ? mapList(w.list) : null,
  };
}

function mapGroup(g: ApiGroup, currentUserId: string): Group {
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
    lists: g.lists.map(mapList),
  };
}

function mapExpense(e: ApiExpense): ExpenseVM {
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

function mapSettlement(s: ApiSettlement): SettlementVM {
  return {
    id: s.id,
    fromUserId: s.fromUserId,
    toUserId: s.toUserId,
    amount: s.amount,
    currency: s.currency,
    createdAt: Date.parse(s.createdAt),
  };
}

function mapExpenseGroup(g: ApiExpenseGroup, currentUserId: string): ExpenseGroup {
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
    expenses: g.expenses.map(mapExpense),
    settlements: g.settlements.map(mapSettlement),
  };
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
function computeExpenseBalances(group: ExpenseGroup): Record<string, Record<string, number>> {
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

// ─── Item photo compression ────────────────────────────────────────────────
//
// Item photos travel as base64 data URLs in the JSON request body (no file
// storage service is wired up), so they're downscaled and re-encoded as JPEG
// client-side first to keep payloads small. Two passes: a normal-quality one,
// then a smaller/lower-quality retry if the first still came out too big.

async function encodeImage(file: File, maxDim: number, quality: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    bitmap.close();
  }
}

const MAX_IMAGE_DATA_URL_LENGTH = 2_000_000; // stays comfortably under the server's cap

async function compressImageToDataUrl(file: File): Promise<string> {
  const first = await encodeImage(file, 1024, 0.75);
  if (first.length <= MAX_IMAGE_DATA_URL_LENGTH) return first;
  const second = await encodeImage(file, 720, 0.6);
  if (second.length <= MAX_IMAGE_DATA_URL_LENGTH) return second;
  throw new Error("Image too large even after compression");
}

// ─── Bottom tab bar ───────────────────────────────────────────────────────────

const NAV_HEIGHT = 68;

// The status bar/notch inset, trimmed a bit — using it as-is left a
// noticeably taller gap above headers than the design called for.
const TOP_INSET = `max(0px, calc(${SAFE_AREA_TOP} - 12px))`;

function BottomNav({ active, onChange }: { active: TabScreen; onChange: (tab: TabScreen) => void }) {
  const { t } = useTranslation();
  const tabs: { key: TabScreen; label: string; icon: React.ReactNode }[] = [
    { key: "groups", label: t("nav.groups"), icon: <Home className="w-5 h-5" /> },
    { key: "expenseGroups", label: t("nav.expenses"), icon: <Wallet className="w-5 h-5" /> },
    { key: "wishlists", label: t("nav.wishlists"), icon: <Gift className="w-5 h-5" /> },
    { key: "profile", label: t("nav.profile"), icon: <UserRound className="w-5 h-5" /> },
  ];
  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-30 bg-card/95 backdrop-blur-sm border-t border-border flex"
      style={{ paddingBottom: SAFE_AREA_BOTTOM }}
    >
      {tabs.map(t => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            <span className="text-[11px] font-semibold">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Loading splash ───────────────────────────────────────────────────────────

function BootSplash({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-background gap-5 px-8 h-full">
      <div className="w-16 h-16 rounded-[22px] bg-primary flex items-center justify-center shadow-xl shadow-primary/30">
        <ShoppingBag className="w-8 h-8 text-primary-foreground" />
      </div>
      {error ? (
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground max-w-[240px]">{error}</p>
          <Btn variant="outline" size="sm" onClick={onRetry}>{t("common.tryAgain")}</Btn>
        </div>
      ) : (
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
      )}
    </div>
  );
}

// ─── Pull to refresh ────────────────────────────────────────────────────────
//
// Wraps the whole screen stage so swipe-down-to-refresh works the same on
// every screen. React attaches its synthetic touchstart/touchmove listeners
// as passive by default, which silently no-ops preventDefault() — so this
// binds native listeners itself (touchmove non-passive) to actually be able
// to suppress the browser's own scroll/bounce while a pull is in progress.

const PULL_THRESHOLD = 64;
const PULL_MAX = 100;

function findScrollParent(el: HTMLElement | null, boundary: HTMLElement): HTMLElement | null {
  let node = el;
  while (node && node !== boundary) {
    const style = getComputedStyle(node);
    if ((style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void>; children: React.ReactNode }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const onRefreshRef = useRef(onRefresh);
  const gestureRef = useRef({ startY: 0, pulling: false, active: false });

  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function onTouchStart(e: TouchEvent) {
      if (gestureRef.current.active) return;
      // A touch starting on an item's drag handle is reordering, not
      // pulling — both watch vertical movement on the same touch, so let
      // Motion's drag gesture have it instead of racing it here.
      if ((e.target as HTMLElement).closest?.("[data-drag-item]")) {
        gestureRef.current = { startY: 0, pulling: false, active: false };
        return;
      }
      const scrollParent = findScrollParent(e.target as HTMLElement, container!);
      const atTop = !scrollParent || scrollParent.scrollTop <= 0;
      gestureRef.current = { startY: e.touches[0].clientY, pulling: atTop, active: false };
    }

    function onTouchMove(e: TouchEvent) {
      if (!gestureRef.current.pulling) return;
      const delta = e.touches[0].clientY - gestureRef.current.startY;
      if (delta <= 0) {
        setPullDistance(0);
        return;
      }
      const scrollParent = findScrollParent(e.target as HTMLElement, container!);
      if (scrollParent && scrollParent.scrollTop > 0) {
        gestureRef.current.pulling = false;
        setPullDistance(0);
        return;
      }
      e.preventDefault();
      setPullDistance(Math.min(delta * 0.45, PULL_MAX));
    }

    function onTouchEnd() {
      if (!gestureRef.current.pulling) return;
      gestureRef.current.pulling = false;
      setPullDistance(current => {
        if (current >= PULL_THRESHOLD) {
          gestureRef.current.active = true;
          setRefreshing(true);
          onRefreshRef.current().finally(() => {
            gestureRef.current.active = false;
            setRefreshing(false);
            setPullDistance(0);
          });
          return PULL_THRESHOLD;
        }
        return 0;
      });
    }

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });
    container.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <div
        className="absolute left-0 right-0 flex items-center justify-center pointer-events-none z-40"
        style={{
          top: TOP_INSET,
          height: 56,
          transform: `translateY(${pullDistance - 56}px)`,
          transition: pullDistance === 0 || refreshing ? "transform 0.2s" : "none",
        }}
      >
        <Loader2
          className={`w-5 h-5 text-primary transition-opacity ${pullDistance > 10 || refreshing ? "opacity-100" : "opacity-0"} ${refreshing ? "animate-spin" : ""}`}
          style={!refreshing ? { transform: `rotate(${pullDistance * 2.4}deg)` } : undefined}
        />
      </div>
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: pullDistance === 0 || refreshing ? "transform 0.2s ease-out" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Zoomable lightbox image ────────────────────────────────────────────────
//
// Pinch-to-zoom (two-finger) and drag-to-pan once zoomed, plus double-tap to
// toggle zoom, for touch devices. Mounted fresh each time a lightbox opens,
// so zoom/pan state always starts back at rest.

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_WINDOW_MS = 300;

function clampNum(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function touchDistance(touches: ReactTouchList) {
  return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
}

function ZoomableImage({ src, alt, className, onZoomChange }: {
  src: string; alt: string; className?: string; onZoomChange?: (zoomed: boolean) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const gesture = useRef({
    mode: "none" as "none" | "pinch" | "pan",
    startDist: 0,
    startScale: 1,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    lastTapTime: 0,
  });

  // Lets a sibling swipe-to-navigate gesture (see BonusCardLightbox) know to
  // back off while this image is zoomed in, instead of racing it for the
  // same touch.
  useEffect(() => {
    if (!onZoomChange) return;
    return scale.on("change", v => onZoomChange(v > 1.02));
  }, [onZoomChange, scale]);

  function clampPan(nx: number, ny: number, s: number) {
    const el = imgRef.current;
    if (!el) return { x: nx, y: ny };
    const maxX = (el.offsetWidth * (s - 1)) / 2;
    const maxY = (el.offsetHeight * (s - 1)) / 2;
    return { x: clampNum(nx, -maxX, maxX), y: clampNum(ny, -maxY, maxY) };
  }

  function reset() {
    const spring = { type: "spring" as const, stiffness: 300, damping: 30 };
    animate(scale, 1, spring);
    animate(x, 0, spring);
    animate(y, 0, spring);
  }

  function handleTouchStart(e: ReactTouchEvent<HTMLImageElement>) {
    if (e.touches.length === 2) {
      gesture.current.mode = "pinch";
      gesture.current.startDist = touchDistance(e.touches);
      gesture.current.startScale = scale.get();
    } else if (e.touches.length === 1) {
      const now = Date.now();
      const isDoubleTap = now - gesture.current.lastTapTime < DOUBLE_TAP_WINDOW_MS;
      gesture.current.lastTapTime = now;
      if (isDoubleTap) {
        gesture.current.mode = "none";
        if (scale.get() > 1.05) reset();
        else animate(scale, DOUBLE_TAP_ZOOM, { type: "spring", stiffness: 300, damping: 30 });
        return;
      }
      gesture.current.mode = scale.get() > 1.02 ? "pan" : "none";
      gesture.current.startX = e.touches[0].clientX;
      gesture.current.startY = e.touches[0].clientY;
      gesture.current.startPanX = x.get();
      gesture.current.startPanY = y.get();
    }
  }

  function handleTouchMove(e: ReactTouchEvent<HTMLImageElement>) {
    if (gesture.current.mode === "pinch" && e.touches.length === 2) {
      e.preventDefault();
      const dist = touchDistance(e.touches);
      const nextScale = clampNum(
        gesture.current.startScale * (dist / gesture.current.startDist),
        ZOOM_MIN, ZOOM_MAX,
      );
      scale.set(nextScale);
      const clamped = clampPan(x.get(), y.get(), nextScale);
      x.set(clamped.x);
      y.set(clamped.y);
    } else if (gesture.current.mode === "pan" && e.touches.length === 1) {
      e.preventDefault();
      const dx = e.touches[0].clientX - gesture.current.startX;
      const dy = e.touches[0].clientY - gesture.current.startY;
      const clamped = clampPan(gesture.current.startPanX + dx, gesture.current.startPanY + dy, scale.get());
      x.set(clamped.x);
      y.set(clamped.y);
    }
  }

  function handleTouchEnd(e: ReactTouchEvent<HTMLImageElement>) {
    if (e.touches.length === 1) {
      // Pinch ended with one finger still down — carry on as a pan.
      gesture.current.mode = scale.get() > 1.02 ? "pan" : "none";
      gesture.current.startX = e.touches[0].clientX;
      gesture.current.startY = e.touches[0].clientY;
      gesture.current.startPanX = x.get();
      gesture.current.startPanY = y.get();
    } else if (e.touches.length === 0) {
      gesture.current.mode = "none";
    }
  }

  return (
    <motion.img
      ref={imgRef}
      src={src}
      alt={alt}
      style={{ scale, x, y, touchAction: "none" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={e => e.stopPropagation()}
      className={className}
    />
  );
}

// ─── Bonus cards ────────────────────────────────────────────────────────────
//
// A group-owned, named set of images pinned to the bottom of the group's own
// page and every one of its list pages. Any member can add or remove one;
// they're stored on the group and show up everywhere that group's data is
// shown. Tapping a card opens it full-size with the option to delete it.

const cardSlideVariants = {
  enter: (dir: number) => ({ x: dir * -60, opacity: 0, scale: 0.96 }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (dir: number) => ({ x: dir * -60, opacity: 0, scale: 0.96 }),
};

// The lightbox is a carousel: swipe (or use the arrow buttons/arrow keys)
// to move between cards without closing and reopening. Swiping is disabled
// while the current image is pinch-zoomed, so it doesn't fight panning.
function BonusCardRow({ cards, onAdd, onDelete }: {
  cards: BonusCardVM[]; onAdd: () => void; onDelete: (cardId: string) => void;
}) {
  const { t } = useTranslation();
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const dirRef = useRef(1);
  const zoomedRef = useRef(false);
  const dragX = useMotionValue(0);
  const gesture = useRef({ active: false, startX: 0 });
  const card = viewingIndex !== null ? cards[viewingIndex] : null;

  function go(delta: 1 | -1) {
    if (viewingIndex === null) return;
    dirRef.current = delta;
    setViewingIndex((viewingIndex + delta + cards.length) % cards.length);
  }

  function close() {
    setViewingIndex(null);
  }

  useEffect(() => {
    if (viewingIndex === null || cards.length < 2) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingIndex, cards.length]);

  function handleTouchStart(e: ReactTouchEvent) {
    if (cards.length < 2 || zoomedRef.current || e.touches.length !== 1) return;
    gesture.current = { active: true, startX: e.touches[0].clientX };
  }
  function handleTouchMove(e: ReactTouchEvent) {
    if (!gesture.current.active || zoomedRef.current) return;
    dragX.set(e.touches[0].clientX - gesture.current.startX);
  }
  function handleTouchEnd() {
    if (!gesture.current.active) return;
    gesture.current.active = false;
    const dx = dragX.get();
    const SWIPE_THRESHOLD = 70;
    if (dx <= -SWIPE_THRESHOLD) { dragX.set(0); go(1); }
    else if (dx >= SWIPE_THRESHOLD) { dragX.set(0); go(-1); }
    else animate(dragX, 0, { type: "spring", stiffness: 400, damping: 34 });
  }

  return (
    <div className="px-4 pb-4 pt-1 flex-shrink-0">
      <div className="flex gap-2.5 overflow-x-auto">
        {cards.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setViewingIndex(i)}
            className="flex-shrink-0 w-20 text-center"
          >
            <div className="w-20 h-20 rounded-2xl overflow-hidden border border-border shadow-sm">
              <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover" />
            </div>
            <p className="text-[11px] font-medium text-muted-foreground mt-1 truncate">{c.name}</p>
          </button>
        ))}
        <button
          type="button"
          onClick={onAdd}
          aria-label={t("bonusCard.addAria")}
          className="flex-shrink-0 w-20 h-20 rounded-2xl border-2 border-dashed border-border bg-muted/40 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <ImagePlus className="w-5 h-5" />
          <span className="text-[10px] font-semibold">{t("bonusCard.add")}</span>
        </button>
      </div>

      <AnimatePresence>
        {card && (
          <motion.div
            key="bonus-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-6 gap-4"
          >
            <AnimatePresence mode="popLayout" initial={false} custom={dirRef.current}>
              <motion.div
                key={card.id}
                custom={dirRef.current}
                variants={cardSlideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                onClick={e => e.stopPropagation()}
                className="flex flex-col items-center gap-4 max-w-full"
              >
                <motion.div style={{ x: dragX }} className="max-w-full max-h-[65vh]">
                  <ZoomableImage
                    src={card.imageUrl}
                    alt={card.name}
                    onZoomChange={z => { zoomedRef.current = z; }}
                    className="max-w-full max-h-[65vh] rounded-2xl object-contain"
                  />
                </motion.div>
                <p className="text-white font-semibold text-base text-center px-4">{card.name}</p>
                {cards.length > 1 && (
                  <p className="text-white/60 text-xs font-semibold tabular-nums -mt-2">{viewingIndex! + 1} / {cards.length}</p>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={close}
                    type="button"
                    className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors"
                  >
                    {t("bonusCard.close")}
                  </button>
                  <button
                    onClick={() => { onDelete(card.id); close(); }}
                    type="button"
                    className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t("bonusCard.delete")}
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>

            {cards.length > 1 && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); go(-1); }}
                  type="button"
                  aria-label={t("bonusCard.previous")}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); go(1); }}
                  type="button"
                  aria-label={t("bonusCard.next")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            <button
              onClick={close}
              type="button"
              aria-label={t("bonusCard.close")}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Groups ───────────────────────────────────────────────────────────────────

function Groups({ groups, onOpen, onOpenActiveList, onAddList, onCreate, onJoin }: {
  groups: Group[]; onOpen: (id: string) => void; onOpenActiveList: (groupId: string, listId: string) => void;
  onAddList: (groupId: string) => void; onCreate: () => void; onJoin: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h1 className="text-2xl font-bold text-foreground">{t("groups.title")}</h1>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onJoin}
            className="h-9 px-3.5 rounded-xl text-sm font-semibold text-primary hover:bg-primary/10 transition-colors flex items-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" />
            {t("groups.join")}
          </button>
          <button
            onClick={onCreate}
            className="w-9 h-9 rounded-2xl bg-primary flex items-center justify-center hover:opacity-90 transition-all active:scale-95 shadow-sm shadow-primary/30"
          >
            <Plus className="w-4 h-4 text-primary-foreground" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-5">
            <div className="w-16 h-16 rounded-3xl bg-muted flex items-center justify-center">
              <Users className="w-7 h-7 text-muted-foreground" />
            </div>
            <div className="text-center space-y-1.5">
              <p className="font-semibold text-foreground">{t("groups.emptyTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("groups.emptyBody")}</p>
            </div>
            <Btn variant="primary" onClick={onCreate} size="md">
              <Plus className="w-4 h-4" />
              {t("groups.createGroup")}
            </Btn>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((g, i) => {
              const allItems = g.lists.flatMap(l => l.items);
              const activeCount = allItems.filter(item => !item.completed).length;
              const allDone = allItems.length > 0 && activeCount === 0;
              const activeList = g.lists.length > 0 ? g.lists[g.lists.length - 1] : null;
              return (
                <motion.div
                  key={g.id}
                  layout
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(g.id)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(g.id); } }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.22 }}
                  className="w-full bg-card border border-border rounded-2xl p-4 flex items-start gap-3.5 hover:bg-muted/20 active:scale-[0.985] transition-all text-left shadow-sm cursor-pointer"
                >
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl flex-shrink-0">
                    {g.emoji}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2.5">
                    <div>
                      <p className="font-semibold text-foreground text-sm leading-snug">{g.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs">
                        <span className="text-muted-foreground">{t("groups.listCount", { count: g.lists.length })}</span>
                        {allDone && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{t("listStatus.allDone")}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-1.5">
                        {g.members.slice(0, 5).map(mem => (
                          <div key={mem.id} className="ring-2 ring-card rounded-full">
                            <Avatar m={mem} size="xs" />
                          </div>
                        ))}
                        {g.members.length > 5 && (
                          <div className="w-6 h-6 rounded-full bg-muted ring-2 ring-card text-[9px] font-bold text-muted-foreground flex items-center justify-center">
                            +{g.members.length - 5}
                          </div>
                        )}
                      </div>
                      <div className="flex-1" />
                      {activeList && (
                        <button
                          onClick={e => { e.stopPropagation(); onOpenActiveList(g.id, activeList.id); }}
                          className="h-8 px-3 rounded-lg text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/15 active:scale-95 transition-all flex-shrink-0"
                        >
                          {t("groups.activeList")}
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); onAddList(g.id); }}
                        aria-label={t("groups.addListAria", { name: g.name })}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95 transition-all flex-shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Wishlists ────────────────────────────────────────────────────────────────

function WishlistsScreen({ wishlists, onOpen, onCreate }: {
  wishlists: Wishlist[]; onOpen: (id: string) => void; onCreate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h1 className="text-2xl font-bold text-foreground">{t("wishlists.title")}</h1>
        <button
          onClick={onCreate}
          className="w-9 h-9 rounded-2xl bg-primary flex items-center justify-center hover:opacity-90 transition-all active:scale-95 shadow-sm shadow-primary/30"
        >
          <Plus className="w-4 h-4 text-primary-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {wishlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-5">
            <div className="w-16 h-16 rounded-3xl bg-muted flex items-center justify-center">
              <Gift className="w-7 h-7 text-muted-foreground" />
            </div>
            <div className="text-center space-y-1.5">
              <p className="font-semibold text-foreground">{t("wishlists.emptyTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("wishlists.emptyBody")}</p>
            </div>
            <Btn variant="primary" onClick={onCreate} size="md">
              <Plus className="w-4 h-4" />
              {t("wishlists.createWishlist")}
            </Btn>
          </div>
        ) : (
          <div className="space-y-3">
            {wishlists.map((w, i) => {
              const items = w.list?.items ?? [];
              const activeCount = items.filter(item => !item.completed).length;
              const allDone = items.length > 0 && activeCount === 0;
              return (
                <motion.div
                  key={w.id}
                  layout
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(w.id)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(w.id); } }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.22 }}
                  className="w-full bg-card border border-border rounded-2xl p-4 flex items-center gap-3.5 hover:bg-muted/20 active:scale-[0.985] transition-all text-left shadow-sm cursor-pointer"
                >
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl flex-shrink-0">
                    {w.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm leading-snug">{w.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs">
                      {items.length === 0 ? (
                        <span className="text-muted-foreground">{t("listStatus.noItems")}</span>
                      ) : allDone ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{t("listStatus.allDone")}</span>
                      ) : (
                        <>
                          <span className="text-primary font-semibold">{t("listStatus.left", { count: activeCount })}</span>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="text-muted-foreground">{items.length - activeCount}/{items.length}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Expense groups ─────────────────────────────────────────────────────────

function formatRelativeDate(timestamp: number, locale: string): string {
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true, locale: locale === "hy" ? hyLocale : undefined });
}

// A card/header summary of the signed-in member's net balance in the first
// currency that has one (a group with expenses logged in several currencies
// keeps the summary compact rather than listing every one).
type BalanceSummary = { kind: "owed" | "owes"; amount: string } | { kind: "settled" } | null;

function myExpenseBalanceSummary(group: ExpenseGroup, locale: string): BalanceSummary {
  const me = group.members.find(m => m.isCurrentUser);
  if (!me) return null;
  const balances = computeExpenseBalances(group);
  const mine = balances[me.id] ?? {};
  const entry = Object.entries(mine).find(([, amt]) => Math.abs(amt) > 0.005);
  if (!entry) return group.expenses.length > 0 ? { kind: "settled" } : null;
  const [currency, amt] = entry;
  const amount = formatMoney(Math.abs(amt), currency, locale);
  return amt > 0 ? { kind: "owed", amount } : { kind: "owes", amount };
}

function ExpenseGroupsScreen({ groups, onOpen, onCreate, onJoin }: {
  groups: ExpenseGroup[]; onOpen: (id: string) => void; onCreate: () => void; onJoin: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h1 className="text-2xl font-bold text-foreground">{t("expenseGroups.title")}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={onJoin}
            aria-label={t("expenseGroups.join")}
            className="w-9 h-9 rounded-2xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-all active:scale-95"
          >
            <UserPlus className="w-4 h-4 text-foreground" />
          </button>
          <button
            onClick={onCreate}
            className="w-9 h-9 rounded-2xl bg-primary flex items-center justify-center hover:opacity-90 transition-all active:scale-95 shadow-sm shadow-primary/30"
          >
            <Plus className="w-4 h-4 text-primary-foreground" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-5">
            <div className="w-16 h-16 rounded-3xl bg-muted flex items-center justify-center">
              <Wallet className="w-7 h-7 text-muted-foreground" />
            </div>
            <div className="text-center space-y-1.5">
              <p className="font-semibold text-foreground">{t("expenseGroups.emptyTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("expenseGroups.emptyBody")}</p>
            </div>
            <Btn variant="primary" onClick={onCreate} size="md">
              <Plus className="w-4 h-4" />
              {t("expenseGroups.createGroup")}
            </Btn>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((g, i) => {
              const summary = myExpenseBalanceSummary(g, i18n.language);
              return (
                <motion.div
                  key={g.id}
                  layout
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(g.id)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(g.id); } }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.22 }}
                  className="w-full bg-card border border-border rounded-2xl p-4 flex items-center gap-3.5 hover:bg-muted/20 active:scale-[0.985] transition-all text-left shadow-sm cursor-pointer"
                >
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl flex-shrink-0">
                    {g.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm leading-snug">{g.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs">
                      {summary == null ? (
                        <span className="text-muted-foreground">{t("expenseGroups.noExpensesYet")}</span>
                      ) : summary.kind === "settled" ? (
                        <span className="font-semibold text-muted-foreground">{t("expenseGroups.settledUp")}</span>
                      ) : (
                        <span className={`font-semibold ${summary.kind === "owed" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                          {summary.kind === "owed"
                            ? t("expenseGroups.youAreOwed", { amount: summary.amount })
                            : t("expenseGroups.youOwe", { amount: summary.amount })}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ExpenseRow({ expense, members, onEdit, onDelete }: {
  expense: ExpenseVM; members: Member[]; onEdit: () => void; onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const payer = members.find(m => m.id === expense.paidById);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="flex items-center gap-3.5 py-3.5 px-1"
    >
      <button
        type="button"
        onClick={onEdit}
        aria-label={t("expenseGroupScreen.editExpenseAria", { description: expense.description })}
        className="flex-1 min-w-0 flex items-center gap-3.5 text-left rounded-xl hover:bg-muted/40 transition-colors -my-1 py-1"
      >
        {payer && <Avatar m={payer} size="sm" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{expense.description}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {payer ? t("expenseGroupScreen.paidBy", { name: payer.name }) : ""}
            {" · "}
            {formatRelativeDate(expense.createdAt, i18n.language)}
          </p>
        </div>
        <span className="text-sm font-semibold tabular-nums text-foreground flex-shrink-0">
          {formatMoney(expense.amount, expense.currency, i18n.language)}
        </span>
      </button>
      <button
        onClick={onDelete}
        type="button"
        aria-label={t("expenseGroupScreen.deleteExpenseAria", { description: expense.description })}
        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:bg-red-500/10 hover:text-red-500 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

function SettlementRow({ settlement, members, onDelete }: {
  settlement: SettlementVM; members: Member[]; onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const from = members.find(m => m.id === settlement.fromUserId);
  const to = members.find(m => m.id === settlement.toUserId);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="flex items-center gap-3.5 py-3.5 px-1"
    >
      <div className="flex-1 min-w-0 flex items-center gap-3.5">
        <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
          <ArrowRightLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {t("expenseGroupScreen.settlementLine", { from: from?.name ?? "?", to: to?.name ?? "?" })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{formatRelativeDate(settlement.createdAt, i18n.language)}</p>
        </div>
        <span className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400 flex-shrink-0">
          {formatMoney(settlement.amount, settlement.currency, i18n.language)}
        </span>
      </div>
      <button
        onClick={onDelete}
        type="button"
        aria-label={t("expenseGroupScreen.deleteSettlementAria", { from: from?.name, to: to?.name })}
        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:bg-red-500/10 hover:text-red-500 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

type ExpenseGroupActivityItem =
  | { kind: "expense"; createdAt: number; expense: ExpenseVM }
  | { kind: "settlement"; createdAt: number; settlement: SettlementVM };

function ExpenseGroupScreen({ group, onBack, onSettings, onAddExpense, onEditExpense, onDeleteExpense, onSettleUp, onDeleteSettlement }: {
  group: ExpenseGroup; onBack: () => void; onSettings: () => void;
  onAddExpense: () => void; onEditExpense: (expense: ExpenseVM) => void; onDeleteExpense: (expense: ExpenseVM) => void;
  onSettleUp: () => void; onDeleteSettlement: (settlement: SettlementVM) => void;
}) {
  const { t, i18n } = useTranslation();
  const balances = computeExpenseBalances(group);
  const me = group.members.find(m => m.isCurrentUser);
  const myBalances = me ? balances[me.id] ?? {} : {};
  const myEntries = Object.entries(myBalances).filter(([, amt]) => Math.abs(amt) > 0.005);
  const activity: ExpenseGroupActivityItem[] = [
    ...group.expenses.map((expense): ExpenseGroupActivityItem => ({ kind: "expense", createdAt: expense.createdAt, expense })),
    ...group.settlements.map((settlement): ExpenseGroupActivityItem => ({ kind: "settlement", createdAt: settlement.createdAt, settlement })),
  ].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted -ml-1 flex-shrink-0 transition-colors">
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <span className="text-[20px]">{group.emoji}</span>
        <h2 className="flex-1 font-bold text-lg text-foreground truncate">{group.name}</h2>
        <div className="flex -space-x-1.5">
          {group.members.slice(0, 3).map(m => (
            <div key={m.id} className="ring-2 ring-background rounded-full">
              <Avatar m={m} size="xs" />
            </div>
          ))}
          {group.members.length > 3 && (
            <div className="w-6 h-6 rounded-full bg-muted ring-2 ring-background text-[9px] font-bold text-muted-foreground flex items-center justify-center">
              +{group.members.length - 3}
            </div>
          )}
        </div>
        <button
          onClick={onSettings}
          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted transition-colors ml-1"
        >
          <Settings className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="px-4 pt-3 pb-6">
          {/* Balances card */}
          <div className="bg-card border border-border rounded-2xl p-4 mb-4">
            {myEntries.length === 0 ? (
              <p className="text-sm font-semibold text-muted-foreground text-center">{t("expenseGroupScreen.youAreSettledUp")}</p>
            ) : (
              <div className="space-y-1 mb-3">
                {myEntries.map(([currency, amt]) => (
                  <p key={currency} className={`text-sm font-bold text-center ${amt > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                    {amt > 0
                      ? t("expenseGroupScreen.youAreOwedTotal", { amount: formatMoney(amt, currency, i18n.language) })
                      : t("expenseGroupScreen.youOweTotal", { amount: formatMoney(-amt, currency, i18n.language) })}
                  </p>
                ))}
              </div>
            )}
            <div className="space-y-2 pt-3 border-t border-border">
              {group.members.filter(m => !m.isCurrentUser).map(m => {
                const entries = Object.entries(balances[m.id] ?? {}).filter(([, amt]) => Math.abs(amt) > 0.005);
                return (
                  <div key={m.id} className="flex items-center gap-2.5">
                    <Avatar m={m} size="xs" />
                    <span className="flex-1 text-xs font-medium text-foreground truncate">{m.name}</span>
                    {entries.length === 0 ? (
                      <span className="text-xs text-muted-foreground">{t("expenseGroupScreen.settledUp")}</span>
                    ) : (
                      <span className="text-xs font-semibold tabular-nums">
                        {entries.map(([currency, amt], i) => (
                          <span key={currency} className={amt > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}>
                            {i > 0 && " · "}
                            {formatMoney(Math.abs(amt), currency, i18n.language)}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {activity.length === 0 && (
            <div className="text-center pt-8 pb-2">
              <p className="text-sm text-muted-foreground">{t("expenseGroupScreen.empty")}</p>
            </div>
          )}
          <AnimatePresence initial={false}>
            {activity.map(item => item.kind === "expense" ? (
              <ExpenseRow
                key={`e-${item.expense.id}`} expense={item.expense} members={group.members}
                onEdit={() => onEditExpense(item.expense)} onDelete={() => onDeleteExpense(item.expense)}
              />
            ) : (
              <SettlementRow
                key={`s-${item.settlement.id}`} settlement={item.settlement} members={group.members}
                onDelete={() => onDeleteSettlement(item.settlement)}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className="px-5 pb-8 pt-3 border-t border-border/50 bg-background flex gap-3">
        <Btn variant="outline" full size="lg" onClick={onSettleUp}>
          <ArrowRightLeft className="w-5 h-5" />
          {t("expenseGroupScreen.settleUp")}
        </Btn>
        <Btn variant="primary" full size="lg" onClick={onAddExpense}>
          <Plus className="w-5 h-5" />
          {t("expenseGroupScreen.addExpense")}
        </Btn>
      </div>
    </div>
  );
}

// ─── List card (used for both the featured active list and the rest) ─────────

function ListCard({ list, featured, delay = 0, onClick, onDelete }: {
  list: ListSummary; featured?: boolean; delay?: number; onClick: () => void; onDelete: () => void;
}) {
  const { t } = useTranslation();
  const activeCount = list.items.filter(i => !i.completed).length;
  const doneCount = list.items.length - activeCount;
  const allDone = list.items.length > 0 && activeCount === 0;
  const pct = list.items.length === 0 ? 0 : (doneCount / list.items.length) * 100;

  return (
    <motion.div
      layout
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.22 }}
      className={`w-full text-left rounded-2xl p-4 transition-all active:scale-[0.985] cursor-pointer ${
        featured
          ? "bg-primary/8 border-2 border-primary/30 shadow-sm"
          : "bg-card border border-border hover:bg-muted/20 shadow-sm"
      }`}
    >
      <div className="flex items-center gap-3.5">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${featured ? "bg-primary/15" : "bg-muted"}`}>
          📋
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm leading-snug truncate">{list.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs">
            {list.items.length === 0 ? (
              <span className="text-muted-foreground">{t("listStatus.noItems")}</span>
            ) : allDone ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{t("listStatus.allDone")}</span>
            ) : (
              <>
                <span className="text-primary font-semibold">{t("listStatus.left", { count: activeCount })}</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-muted-foreground">{doneCount}/{list.items.length}</span>
              </>
            )}
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          aria-label={t("listCard.deleteAria", { name: list.name })}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-red-500/10 hover:text-red-500 active:scale-95 transition-all flex-shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </div>
      {list.items.length > 0 && (
        <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-3">
          <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      )}
    </motion.div>
  );
}

// ─── Lists overview (a group's home screen) ────────────────────────────────────

function ListsScreen({ group, onOpenList, onDeleteList, onAddList, onSettings, onBack, onAddBonusCard, onDeleteBonusCard }: {
  group: Group; onOpenList: (listId: string) => void; onDeleteList: (listId: string, name: string) => void;
  onAddList: () => void; onSettings: () => void; onBack: () => void;
  onAddBonusCard: () => void; onDeleteBonusCard: (cardId: string) => void;
}) {
  const { t } = useTranslation();
  const lists = group.lists;
  const active = lists.length > 0 ? lists[lists.length - 1] : null;
  const others = lists.length > 1 ? lists.slice(0, -1).slice().reverse() : [];

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted -ml-1 flex-shrink-0 transition-colors">
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <span className="text-[20px]">{group.emoji}</span>
        <h2 className="flex-1 font-bold text-lg text-foreground truncate">{group.name}</h2>
        <div className="flex -space-x-1.5">
          {group.members.slice(0, 3).map(m => (
            <div key={m.id} className="ring-2 ring-background rounded-full">
              <Avatar m={m} size="xs" />
            </div>
          ))}
          {group.members.length > 3 && (
            <div className="w-6 h-6 rounded-full bg-muted ring-2 ring-background text-[9px] font-bold text-muted-foreground flex items-center justify-center">
              +{group.members.length - 3}
            </div>
          )}
        </div>
        <button
          onClick={onSettings}
          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted transition-colors ml-1"
        >
          <Settings className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
        {lists.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 px-8">
            <div className="w-16 h-16 rounded-3xl bg-muted flex items-center justify-center text-3xl">📋</div>
            <div className="text-center space-y-1.5">
              <p className="font-semibold text-foreground">{t("listsScreen.emptyTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("listsScreen.emptyBody")}</p>
            </div>
            <Btn variant="primary" onClick={onAddList} size="md">
              <Plus className="w-4 h-4" />
              {t("listsScreen.addList")}
            </Btn>
          </div>
        ) : (
          <>
            {active && (
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.18em] mb-2 px-1">{t("listsScreen.activeListLabel")}</p>
                <ListCard
                  list={active} featured onClick={() => onOpenList(active.id)}
                  onDelete={() => onDeleteList(active.id, active.name)}
                />
              </div>
            )}
            {others.length > 0 && (
              <div className="mt-6">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.18em] mb-2 px-1">{t("listsScreen.allListsLabel")}</p>
                <div className="space-y-3">
                  {others.map((l, i) => (
                    <ListCard
                      key={l.id} list={l} delay={i * 0.05} onClick={() => onOpenList(l.id)}
                      onDelete={() => onDeleteList(l.id, l.name)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {lists.length > 0 && (
        <div className="px-5 pb-8 pt-3 border-t border-border/50 bg-background">
          <Btn variant="primary" full size="lg" onClick={onAddList}>
            <Plus className="w-5 h-5" />
            {t("listsScreen.addList")}
          </Btn>
        </div>
      )}
      <BonusCardRow cards={group.bonusCards} onAdd={onAddBonusCard} onDelete={onDeleteBonusCard} />
    </div>
  );
}

// ─── List item row ────────────────────────────────────────────────────────────

function ItemRow({ item, reorderable, onDragEnd, onToggle, onEdit, onDelete, onSetImage, showPrice, defaultCurrency, onSetPrice }: {
  item: ListItem; reorderable?: boolean; onDragEnd?: () => void;
  onToggle: () => void; onEdit: (text: string) => void; onDelete: () => void;
  onSetImage: (imageUrl: string) => void;
  showPrice?: boolean; defaultCurrency?: string;
  onSetPrice?: (price: number | null, currency?: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [attachingPhoto, setAttachingPhoto] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceDraft, setPriceDraft] = useState(item.price != null ? String(item.price) : "");
  const [currencyDraft, setCurrencyDraft] = useState(item.currency ?? defaultCurrency ?? "USD");
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const dragControls = useDragControls();

  function startEditPrice() {
    setPriceDraft(item.price != null ? String(item.price) : "");
    setCurrencyDraft(item.currency ?? defaultCurrency ?? "USD");
    setEditingPrice(true);
    requestAnimationFrame(() => priceInputRef.current?.select());
  }

  function commitPrice(currencyOverride?: string) {
    setEditingPrice(false);
    const nextCurrency = currencyOverride ?? currencyDraft;
    const trimmed = priceDraft.trim();
    if (trimmed === "") {
      if (item.price != null) onSetPrice?.(null);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setPriceDraft(item.price != null ? String(item.price) : "");
      return;
    }
    if (parsed !== item.price || nextCurrency !== item.currency) onSetPrice?.(parsed, nextCurrency);
  }

  function pickCurrency(currency: string) {
    setCurrencyDraft(currency);
    commitPrice(currency);
  }

  function startEdit() {
    setDraft(item.text);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function commit() {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== item.text) onEdit(t);
    else setDraft(item.text);
  }

  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setAttachingPhoto(true);
    try {
      onSetImage(await compressImageToDataUrl(file));
    } catch {
      // Best-effort attachment — a failed photo isn't worth surfacing an error for.
    } finally {
      setAttachingPhoto(false);
    }
  }

  const rowProps = {
    layout: "position" as const,
    initial: { opacity: 0, y: -6 },
    animate: { opacity: item.completed ? 0.6 : 1, y: 0 },
    exit: { opacity: 0 },
    transition: { duration: 0.2 },
    className: `flex items-center gap-3.5 py-3.5 px-1 rounded-xl transition-colors ${!item.completed ? "hover:bg-muted/40" : ""}`,
  };

  const content = (
    <>
      {reorderable && (
        // data-drag-item lets PullToRefresh's own touch handling know to
        // back off for a touch starting here, instead of racing Motion's
        // drag gesture for the same touch (both listen for vertical
        // movement, and PullToRefresh doesn't know about item drags).
        <button
          type="button"
          data-drag-item="true"
          onPointerDown={e => dragControls.start(e)}
          aria-label={t("itemRow.reorder")}
          className="flex-shrink-0 w-5 h-5 -ml-1 flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      )}
      <button
        onClick={onToggle}
        type="button"
        className="flex-shrink-0"
        aria-label={item.completed ? t("itemRow.markIncomplete") : t("itemRow.markComplete")}
      >
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
          item.completed ? "bg-emerald-500 border-emerald-500" : "border-border hover:border-primary/60"
        }`}>
          <AnimatePresence mode="wait">
            {item.completed && (
              <motion.div
                key="c"
                initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 600, damping: 22 }}
              >
                <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </button>
      {item.imageUrl ? (
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label={t("itemRow.viewPhoto")}
          className="flex-shrink-0"
        >
          <img
            src={item.imageUrl}
            alt=""
            className="w-9 h-9 rounded-lg object-cover border border-border"
          />
        </button>
      ) : (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoPick}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={attachingPhoto}
            aria-label={t("itemRow.addPhoto")}
            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            {attachingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
          </button>
        </>
      )}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { setDraft(item.text); setEditing(false); }
          }}
          autoComplete="off"
          className="flex-1 min-w-0 bg-transparent text-base md:text-sm leading-relaxed text-foreground focus:outline-none"
        />
      ) : (
        <span
          onClick={startEdit}
          className={`flex-1 min-w-0 break-words text-sm leading-relaxed transition-all cursor-text ${item.completed ? "line-through text-muted-foreground" : "text-foreground"}`}
        >
          {item.text}
        </span>
      )}
      {showPrice && (
        editingPrice ? (
          <div
            className="flex items-center gap-0.5 flex-shrink-0"
            onBlur={e => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commitPrice();
            }}
          >
            <input
              ref={priceInputRef}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={priceDraft}
              onChange={e => setPriceDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); commitPrice(); }
                if (e.key === "Escape") { setPriceDraft(item.price != null ? String(item.price) : ""); setEditingPrice(false); }
              }}
              placeholder={t("itemRow.pricePlaceholder")}
              className="w-9 bg-transparent text-xs text-right tabular-nums text-muted-foreground focus:outline-none border-b border-dashed border-border"
            />
            <CurrencyPicker value={currencyDraft} onChange={pickCurrency} />
          </div>
        ) : (
          <button
            type="button"
            onClick={startEditPrice}
            aria-label={t("itemRow.editPrice")}
            className="flex-shrink-0 text-[11px] font-semibold tabular-nums px-1 py-0.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {item.price != null
              ? formatMoney(item.price, item.currency ?? defaultCurrency ?? "USD", i18n.language)
              : <DollarSign className="w-3.5 h-3.5" />}
          </button>
        )
      )}
      <button
        onClick={onDelete}
        type="button"
        aria-label={t("itemRow.deleteAria", { text: item.text })}
        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:bg-red-500/10 hover:text-red-500 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      <AnimatePresence>
        {lightboxOpen && item.imageUrl && (
          <motion.div
            key="lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxOpen(false)}
            className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              onClick={e => e.stopPropagation()}
              className="max-w-full max-h-full"
            >
              <ZoomableImage
                src={item.imageUrl}
                alt=""
                className="max-w-full max-h-full rounded-2xl object-contain"
              />
            </motion.div>
            <button
              onClick={() => setLightboxOpen(false)}
              type="button"
              aria-label={t("itemRow.close")}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  if (reorderable) {
    return (
      <Reorder.Item value={item.clientId} dragListener={false} dragControls={dragControls} onDragEnd={onDragEnd} {...rowProps}>
        {content}
      </Reorder.Item>
    );
  }
  return <motion.div {...rowProps}>{content}</motion.div>;
}

// ─── Quick-add row (sits right after the last checkbox) ────────────────────────

function QuickAddRow({ onAdd, showPrice, defaultCurrency }: {
  onAdd: (text: string, imageUrl?: string, price?: number, currency?: string) => void;
  showPrice?: boolean; defaultCurrency?: string;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency ?? "USD");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function submit() {
    const t = text.trim();
    if (!t) return;
    const parsedPrice = Number(price.trim());
    const hasPrice = price.trim() !== "" && Number.isFinite(parsedPrice) && parsedPrice >= 0;
    onAdd(t, imageDataUrl ?? undefined, hasPrice ? parsedPrice : undefined, hasPrice ? currency : undefined);
    setText("");
    setPrice("");
    setCurrency(defaultCurrency ?? "USD");
    setImageDataUrl(null);
    // Stay focused so pressing Enter repeatedly keeps adding items.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setCompressing(true);
    try {
      setImageDataUrl(await compressImageToDataUrl(file));
    } catch {
      // Best-effort attachment — a failed photo shouldn't block adding the item.
    } finally {
      setCompressing(false);
    }
  }

  return (
    <div className="flex items-center gap-3.5 py-3.5 px-1">
      <div className="w-6 h-6 rounded-full border-2 border-dashed border-muted-foreground/40 flex items-center justify-center flex-shrink-0">
        <Plus className="w-3.5 h-3.5 text-muted-foreground/50" />
      </div>
      <input
        ref={inputRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
        placeholder={t("quickAdd.placeholder")}
        autoComplete="off"
        className="flex-1 min-w-0 bg-transparent text-base md:text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
      />
      {showPrice && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={price}
            onChange={e => setPrice(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
            placeholder={t("itemRow.pricePlaceholder")}
            className="w-9 bg-transparent text-sm text-right tabular-nums text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          />
          <CurrencyPicker value={currency} onChange={setCurrency} />
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
      {imageDataUrl ? (
        <div className="relative flex-shrink-0">
          <img src={imageDataUrl} alt="" className="w-8 h-8 rounded-lg object-cover border border-border" />
          <button
            onClick={() => setImageDataUrl(null)}
            type="button"
            aria-label={t("quickAdd.removePhoto")}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          type="button"
          disabled={compressing}
          aria-label={t("quickAdd.attachPhoto")}
          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
        >
          {compressing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
}

// ─── List screen ──────────────────────────────────────────────────────────────

function ListScreen({
  group, list, onBack, onToggle, onEdit, onAdd, onDeleteItem, onSetImage, onAddBonusCard, onDeleteBonusCard,
  onShare, onRename, onDelete, onReorderPreview, onReorderCommit, enablePrice, onSetPrice,
}: {
  group: Group; list: ListSummary; onBack: () => void; onToggle: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onAdd: (text: string, imageUrl?: string, price?: number, currency?: string) => void;
  onDeleteItem: (id: string) => void;
  onSetImage: (id: string, imageUrl: string) => void;
  onAddBonusCard?: () => void; onDeleteBonusCard?: (cardId: string) => void;
  onShare?: () => void; onRename?: () => void; onDelete?: () => void;
  onReorderPreview: (orderedIds: string[]) => void; onReorderCommit: () => void;
  enablePrice?: boolean; onSetPrice?: (id: string, price: number | null, currency?: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const active = list.items.filter(i => !i.completed);
  const done = list.items.filter(i => i.completed).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const total = list.items.length;
  const doneCount = done.length;
  const allDone = total > 0 && active.length === 0;
  const pct = total === 0 ? 0 : (doneCount / total) * 100;

  // Amounts in different currencies can't just be added together, so each
  // total is kept as a per-currency breakdown instead of a single number.
  function sumByCurrency(items: ListItem[]): Record<string, number> {
    const sums: Record<string, number> = {};
    for (const i of items) {
      if (i.price == null) continue;
      const cur = i.currency ?? group.defaultCurrency;
      sums[cur] = (sums[cur] ?? 0) + i.price;
    }
    return sums;
  }
  function formatSums(sums: Record<string, number>): string {
    return Object.entries(sums).map(([cur, amt]) => formatMoney(amt, cur, i18n.language)).join(" + ");
  }

  const doneCostByCurrency = sumByCurrency(done);
  const remainingCostByCurrency = sumByCurrency(active);
  const totalCostByCurrency: Record<string, number> = { ...doneCostByCurrency };
  for (const [cur, amt] of Object.entries(remainingCostByCurrency)) {
    totalCostByCurrency[cur] = (totalCostByCurrency[cur] ?? 0) + amt;
  }
  const hasPricedItems = enablePrice && list.items.some(i => i.price != null);

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted -ml-1 flex-shrink-0 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <h2 className="flex-1 font-bold text-lg text-foreground truncate">{list.name}</h2>
          {onRename && (
            <button
              onClick={onRename}
              aria-label={t("listScreen.editNameIcon")}
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
            >
              <Pencil className="w-4 h-4 text-foreground" />
            </button>
          )}
          {onShare && (
            <button
              onClick={onShare}
              aria-label={t("listScreen.share")}
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
            >
              <Share2 className="w-4.5 h-4.5 text-foreground" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              aria-label={t("listScreen.delete")}
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-red-500/10 transition-colors flex-shrink-0"
            >
              <Trash2 className="w-4 h-4 text-red-500 dark:text-red-400" />
            </button>
          )}
          <div className="flex -space-x-1.5">
            {group.members.slice(0, 3).map(m => (
              <div key={m.id} className="ring-2 ring-background rounded-full">
                <Avatar m={m} size="xs" />
              </div>
            ))}
            {group.members.length > 3 && (
              <div className="w-6 h-6 rounded-full bg-muted ring-2 ring-background text-[9px] font-bold text-muted-foreground flex items-center justify-center">
                +{group.members.length - 3}
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div className="flex items-center gap-2.5 pb-1">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-emerald-500 rounded-full"
                initial={false}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
            <span className="text-xs font-semibold text-muted-foreground tabular-nums">
              {doneCount}/{total}
            </span>
          </div>
        )}

        {/* Price summary */}
        {hasPricedItems && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 pb-1.5 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">{t("listScreen.doneCost")}</span>
              <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatSums(doneCostByCurrency) || formatMoney(0, group.defaultCurrency, i18n.language)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">{t("listScreen.remainingCost")}</span>
              <span className="font-semibold tabular-nums text-foreground">{formatSums(remainingCostByCurrency) || formatMoney(0, group.defaultCurrency, i18n.language)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">{t("listScreen.totalCost")}</span>
              <span className="font-semibold tabular-nums text-foreground">{formatSums(totalCostByCurrency) || formatMoney(0, group.defaultCurrency, i18n.language)}</span>
            </div>
          </div>
        )}
      </div>

      {/* List content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="px-4 pt-1 pb-6">
          {total === 0 && (
            <div className="text-center pt-8 pb-2">
              <p className="text-sm text-muted-foreground">{t("listScreen.empty")}</p>
            </div>
          )}
          <LayoutGroup>
            <Reorder.Group as="div" axis="y" values={active.map(i => i.clientId)} onReorder={onReorderPreview}>
              <AnimatePresence initial={false}>
                {active.map(item => (
                  <ItemRow
                    key={item.clientId} item={item} reorderable onDragEnd={onReorderCommit}
                    onToggle={() => onToggle(item.id)}
                    onEdit={t => onEdit(item.id, t)} onDelete={() => onDeleteItem(item.id)}
                    onSetImage={url => onSetImage(item.id, url)}
                    showPrice={enablePrice} defaultCurrency={group.defaultCurrency}
                    onSetPrice={onSetPrice ? (price, currency) => onSetPrice(item.id, price, currency) : undefined}
                  />
                ))}
              </AnimatePresence>
            </Reorder.Group>

            <QuickAddRow onAdd={onAdd} showPrice={enablePrice} defaultCurrency={group.defaultCurrency} />

            <AnimatePresence initial={false}>
              {allDone && (
                <motion.div
                  key="celebrate" layout
                  initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl px-4 py-3.5 mb-1 mt-2"
                >
                  <span className="text-xl">🎉</span>
                  <div>
                    <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">{t("listScreen.allDoneTitle")}</p>
                    <p className="text-xs text-emerald-700/70 dark:text-emerald-400/70">{t("listScreen.allDoneBody")}</p>
                  </div>
                </motion.div>
              )}
              {done.length > 0 && (
                <motion.div
                  key="divider" layout
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-3 py-3"
                >
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">
                    {t("listScreen.completed")}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </motion.div>
              )}
              {done.map(item => (
                <ItemRow
                  key={item.clientId} item={item} onToggle={() => onToggle(item.id)}
                  onEdit={t => onEdit(item.id, t)} onDelete={() => onDeleteItem(item.id)}
                  onSetImage={url => onSetImage(item.id, url)}
                  showPrice={enablePrice} defaultCurrency={group.defaultCurrency}
                  onSetPrice={onSetPrice ? (price, currency) => onSetPrice(item.id, price, currency) : undefined}
                />
              ))}
            </AnimatePresence>
          </LayoutGroup>
        </div>
      </div>
      {onAddBonusCard && onDeleteBonusCard && (
        <BonusCardRow cards={group.bonusCards} onAdd={onAddBonusCard} onDelete={onDeleteBonusCard} />
      )}
    </div>
  );
}

// ─── Members ──────────────────────────────────────────────────────────────────

function MembersScreen({ group, isAdmin, onBack, onRemove }: {
  group: GroupIdentity; isAdmin: boolean; onBack: () => void; onRemove: (m: Member) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted -ml-1 transition-colors">
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <h2 className="flex-1 font-bold text-lg text-foreground">{t("members.title")}</h2>
        <span className="text-sm text-muted-foreground font-medium">{group.members.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {group.members.map((m, i) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-4 p-3.5 bg-card border border-border rounded-2xl"
          >
            <Avatar m={m} size="md" />
            <div className="flex-1">
              <p className="font-semibold text-foreground text-sm">{m.name}</p>
            </div>
            {m.isCurrentUser && (
              <span className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">{t("common.you")}</span>
            )}
            {isAdmin && !m.isCurrentUser && (
              <button
                onClick={() => onRemove(m)}
                aria-label={t("members.removeAria", { name: m.name })}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Invite ───────────────────────────────────────────────────────────────────

function InviteScreen({ group, onBack, onNewCode }: {
  group: GroupIdentity; onBack: () => void; onNewCode: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [regen, setRegen] = useState(false);

  function copy() {
    navigator.clipboard.writeText(group.inviteCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({
        title: t("invite.shareTitle", { name: group.name }),
        text: t("invite.shareText", { code: group.inviteCode }),
      }).catch(() => {});
    } else {
      copy();
    }
  }

  function doRegen() {
    setRegen(true);
    setTimeout(() => { onNewCode(); setRegen(false); }, 900);
  }

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted -ml-1 transition-colors">
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <h2 className="flex-1 font-bold text-lg text-foreground">{t("invite.title")}</h2>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-7 pb-8">
        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground">{t("invite.shareCodeIntro")}</p>
          <p className="font-bold text-foreground">{group.name}</p>
        </div>

        <div className="w-full space-y-3.5">
          {/* Code display */}
          <motion.div
            key={group.inviteCode}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="w-full bg-card border-2 border-border rounded-3xl p-7 flex flex-col items-center gap-2 shadow-sm"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("invite.inviteCode")}</p>
            <span
              className="text-[38px] font-bold tracking-[0.22em] text-foreground"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              {group.inviteCode}
            </span>
          </motion.div>

          {/* Actions */}
          <div className="flex gap-3">
            <Btn
              variant={copied ? "secondary" : "primary"}
              full
              onClick={copy}
              className={copied ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : ""}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? t("invite.copied") : t("invite.copyCode")}
            </Btn>
            <Btn variant="outline" full onClick={share}>
              <Share2 className="w-4 h-4" />
              {t("invite.share")}
            </Btn>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center leading-relaxed max-w-[256px]">
          {t("invite.hint")}
        </p>

        <button
          onClick={doRegen}
          disabled={regen}
          className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {regen ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {t("invite.generateNewCode")}
        </button>
      </div>
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function SettingsRow({ icon, label, sub, danger, onClick }: {
  icon: React.ReactNode; label: string; sub?: string; danger?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3.5 px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
    >
      <span className={`w-4 h-4 flex-shrink-0 ${danger ? "text-red-500 dark:text-red-400" : "text-muted-foreground"}`}>
        {icon}
      </span>
      <div className="flex-1">
        <p className={`text-sm font-semibold ${danger ? "text-red-500 dark:text-red-400" : "text-foreground"}`}>{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {!danger && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
    </button>
  );
}

function SettingsScreen({ group, isAdmin, onBack, onEdit, onMembers, onInvite, onLeave, onDelete }: {
  group: GroupIdentity; isAdmin: boolean; onBack: () => void; onEdit: () => void; onMembers: () => void;
  onInvite: () => void; onLeave: () => void; onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted -ml-1 transition-colors">
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <h2 className="flex-1 font-bold text-lg text-foreground">{t("settings.title")}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Group identity card */}
        <div className="flex items-center gap-3.5 bg-card border border-border rounded-2xl p-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl">
            {group.emoji}
          </div>
          <div>
            <p className="font-bold text-foreground text-sm">{group.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("settings.membersCount", { count: group.members.length })}{group.myRole === "ADMIN" ? t("settings.youAreAdmin") : ""}
            </p>
          </div>
        </div>

        {/* Group section */}
        <section>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.18em] mb-2 px-1">{t("settings.groupSection")}</p>
          <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
            <SettingsRow icon={<Pencil className="w-full h-full" />} label={t("settings.editGroup")} sub={t("settings.editGroupSub")} onClick={onEdit} />
            <SettingsRow icon={<Users className="w-full h-full" />} label={t("settings.membersLabel")} sub={t("settings.peopleCount", { count: group.members.length })} onClick={onMembers} />
            <SettingsRow icon={<UserPlus className="w-full h-full" />} label={t("settings.inviteMembers")} sub={t("settings.inviteMembersSub")} onClick={onInvite} />
          </div>
        </section>

        {/* Account */}
        <section>
          <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
            <SettingsRow icon={<LogOut className="w-full h-full" />} label={t("settings.leaveGroup")} danger onClick={onLeave} />
            {isAdmin && (
              <SettingsRow icon={<Trash2 className="w-full h-full" />} label={t("settings.deleteGroup")} danger onClick={onDelete} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Public wishlist (read-only, no auth) ──────────────────────────────────────
//
// Reached via a shared link (/w/:token) — deliberately its own component
// rather than reusing ItemRow/QuickAddRow/ListScreen, since every control
// there is interactive and threading a readOnly prop through that whole
// tree for a one-off static view isn't worth it.

function PublicWishlistItemRow({ item }: { item: ListItem }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-1">
      <div
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
          item.completed ? "bg-primary border-primary" : "border-muted-foreground/30"
        }`}
      >
        {item.completed && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
      </div>
      {item.imageUrl && (
        <img src={item.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover border border-border flex-shrink-0" />
      )}
      <span className={`flex-1 text-sm leading-relaxed ${item.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
        {item.text}
      </span>
    </div>
  );
}

function PublicWishlistScreen({ shareToken }: { shareToken: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<
    { status: "loading" } | { status: "error" } | { status: "ready"; data: ApiPublicWishlist }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    apiGetPublicWishlist(shareToken)
      .then(data => { if (!cancelled) setState({ status: "ready", data }); })
      .catch(() => { if (!cancelled) setState({ status: "error" }); });
    return () => { cancelled = true; };
  }, [shareToken]);

  if (state.status === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <div className="w-16 h-16 rounded-3xl bg-muted flex items-center justify-center">
          <Gift className="w-7 h-7 text-muted-foreground" />
        </div>
        <p className="font-semibold text-foreground">{t("publicWishlist.invalidTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("publicWishlist.invalidBody")}</p>
      </div>
    );
  }

  const list = state.data.list;
  const items = (list?.items ?? []).map(mapItem);
  const active = items.filter(i => !i.completed);
  const done = items.filter(i => i.completed).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      <div className="px-4 pt-4 pb-2 border-b border-border flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl flex-shrink-0">
          {state.data.emoji}
        </div>
        <h2 className="flex-1 font-bold text-lg text-foreground truncate">{state.data.name}</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pt-1 pb-6">
        {items.length === 0 && (
          <div className="text-center pt-8 pb-2">
            <p className="text-sm text-muted-foreground">{t("publicWishlist.empty")}</p>
          </div>
        )}
        {active.map(item => <PublicWishlistItemRow key={item.id} item={item} />)}
        {done.length > 0 && (
          <div className="flex items-center gap-3 py-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">{t("listScreen.completed")}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}
        {done.map(item => <PublicWishlistItemRow key={item.id} item={item} />)}
      </div>
      <div className="px-4 py-3 border-t border-border text-center">
        <p className="text-xs text-muted-foreground">{t("publicWishlist.footer")}</p>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { t, i18n } = useTranslation();
  // ── Theme ──
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [sysDark, setSysDark] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)").matches : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  const dark = themeMode === "dark" || (themeMode === "system" && sysDark);

  // ── Navigation ──
  // Real routes (via react-router's HashRouter) drive the current screen, so
  // the browser / Android hardware back button walks backward through actual
  // history entries instead of the whole app living on one route.
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const dir = navigationType === "POP" ? -1 : 1;
  const match = parseRoute(location.pathname);
  const screen = match.screen;
  const canGoBack = (window.history.state?.idx ?? 0) > 0;

  // Read inside the backButton listener below, which is only ever
  // (re)subscribed on mount — anyModalOpen/closeAllModals are declared
  // further down (after all the modal open-state), so their current
  // values need to reach that stable closure via a ref kept fresh every
  // render, rather than through the effect's own (mount-time-only) deps.
  const anyModalOpenRef = useRef(false);
  const closeAllModalsRef = useRef<() => void>(() => {});

  function back() {
    if (anyModalOpen) { closeAllModals(); return; }
    navigate(-1);
  }

  // Capacitor's Android bridge doesn't automatically map the hardware back
  // button to in-app navigation — left unhandled, it just exits the
  // activity from any screen. An open Sheet/Confirm is just an overlay on
  // the current route, not its own route, so it's dismissed first; only
  // once nothing is open does back press pop a route (mirroring `back()`),
  // and only actually exit at the true root.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const subPromise = CapApp.addListener("backButton", () => {
      if (anyModalOpenRef.current) { closeAllModalsRef.current(); return; }
      if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
      else CapApp.exitApp();
    });
    return () => { subPromise.then(sub => sub.remove()); };
  }, [navigate]);

  // ── Session bootstrap ──
  // Nobody is silently signed in: a fresh visitor lands on the login screen
  // and only enters guest mode by explicitly choosing "Continue as guest".
  // A stored session (registered or guest) skips straight past login, and a
  // recognized returning guest is offered a restore prompt instead.
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<ApiUser | null>(null);
  const [recovery, setRecovery] = useState<RecoveryCandidate | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const fingerprintRef = useRef<string>("");
  // A public wishlist link is a valid landing page on its own — bootstrap
  // must never claim it and redirect to /groups (or /login) the way it does
  // for every other first load.
  const routedInitialScreen = useRef(screen === "public-wishlist");
  // Whether the URL already points somewhere specific when the app mounts —
  // true for a page refresh/deep link into a list, wishlist, expense group,
  // settings, etc. A successful bootstrap should leave that route alone
  // instead of bouncing to /groups the way a fresh login does; only "login",
  // "register", and "unknown" (e.g. the bare root) have nowhere to stay.
  const hadSpecificRouteOnLoad = useRef(screen !== "login" && screen !== "register" && screen !== "unknown");
  // Count of in-flight addItem() submissions per "listId::text", still
  // waiting on their REST response. Lets the realtime item:created handler
  // recognize "this is my own submission echoing back" and skip rendering a
  // second row for it — otherwise that row flashes on screen and then gets
  // removed once addItem's own reconciliation runs. A count (not a
  // boolean/Set) matters because adding the same text twice in a row means
  // two submissions are in flight at once — one resolving must not clear
  // the flag out from under the other still-pending one.
  const pendingItemCountsRef = useRef<Map<string, number>>(new Map());
  function pendingItemKey(listId: string, text: string) {
    return `${listId}::${text}`;
  }

  async function refreshGroups(userId: string) {
    const list = await apiListGroups();
    setGroups(list.map(g => mapGroup(g, userId)));
    return list.length;
  }

  async function refreshWishlists() {
    const list = await apiListWishlists();
    setWishlists(list.map(mapWishlist));
  }

  async function refreshExpenseGroups(userId: string) {
    const list = await apiListExpenseGroups();
    setExpenseGroups(list.map(g => mapExpenseGroup(g, userId)));
  }

  async function handlePullRefresh() {
    if (!currentUser) return;
    await Promise.all([refreshGroups(currentUser.id), refreshWishlists(), refreshExpenseGroups(currentUser.id)])
      .catch(() => notify(t("toast.refreshFailed")));
  }

  function enterApp(user: ApiUser) {
    setCurrentUser(user);
    routedInitialScreen.current = true;
    navigate("/groups", { replace: true });
  }

  async function runBootstrap() {
    setBooting(true);
    setBootError(null);
    try {
      if (hasPendingGoogleRedirect()) {
        try {
          const idToken = await completeGoogleRedirectSignIn();
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          const { user, tokens } = await apiLoginWithGoogle(idToken);
          storeTokens(tokens);
          await Promise.all([refreshGroups(user.id), refreshWishlists(), refreshExpenseGroups(user.id)]);
          enterApp(user);
          notify(t("toast.welcome", { name: user.name.split(" ")[0] }));
          setBooting(false);
          return;
        } catch {
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          routedInitialScreen.current = true;
          navigate("/login", { replace: true });
          notify(t("auth.googleError"));
          setBooting(false);
          return;
        }
      }
      const result = await bootstrapSession();
      if (result.status === "recovery-pending") {
        fingerprintRef.current = result.fingerprint;
        setRecovery(result.candidate);
        setBooting(false);
        return;
      }
      if (result.status === "unauthenticated") {
        fingerprintRef.current = result.fingerprint;
        if (!routedInitialScreen.current) {
          routedInitialScreen.current = true;
          navigate("/login", { replace: true });
        }
        setBooting(false);
        return;
      }
      await Promise.all([refreshGroups(result.user.id), refreshWishlists(), refreshExpenseGroups(result.user.id)]);
      if (!routedInitialScreen.current && !hadSpecificRouteOnLoad.current) {
        enterApp(result.user);
      } else {
        routedInitialScreen.current = true;
        setCurrentUser(result.user);
      }
      setBooting(false);
    } catch {
      setBootError(t("boot.connectError"));
      setBooting(false);
    }
  }

  useEffect(() => {
    runBootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleContinueAsGuest() {
    setGuestLoading(true);
    try {
      const user = await continueAsGuest(fingerprintRef.current);
      await Promise.all([refreshGroups(user.id), refreshWishlists(), refreshExpenseGroups(user.id)]);
      enterApp(user);
    } catch {
      notify(t("toast.couldNotStartGuest"));
    } finally {
      setGuestLoading(false);
    }
  }

  async function handleRecoveryAccept() {
    if (!recovery) return;
    setRecoveryLoading(true);
    try {
      const user = await acceptRecovery(recovery.recoveryId);
      await Promise.all([refreshGroups(user.id), refreshWishlists(), refreshExpenseGroups(user.id)]);
      setRecovery(null);
      enterApp(user);
    } catch {
      notify(t("toast.couldNotRestoreSession"));
    } finally {
      setRecoveryLoading(false);
    }
  }

  async function handleRecoveryDecline() {
    if (!recovery) return;
    setRecoveryLoading(true);
    try {
      await declineRecovery(recovery.recoveryId);
    } finally {
      setRecovery(null);
      setRecoveryLoading(false);
      routedInitialScreen.current = true;
      navigate("/login", { replace: true });
    }
  }

  async function handleAuthSuccess(user: ApiUser) {
    const results = await Promise.allSettled([refreshGroups(user.id), refreshWishlists(), refreshExpenseGroups(user.id)]);
    enterApp(user);
    if (results.some(r => r.status === "rejected")) {
      notify(t("toast.refreshFailed"));
    } else {
      notify(t("toast.welcome", { name: user.name.split(" ")[0] }));
    }
  }

  // ── Groups state ──
  const [groups, setGroups] = useState<Group[]>([]);
  const gid = match.groupId;
  const lid = match.listId;
  const cg = groups.find(g => g.id === gid) ?? null;
  const currentList = cg?.lists.find(l => l.id === lid) ?? null;
  const isAdmin = cg?.myRole === "ADMIN";

  // ── Wishlists state ──
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const wid = match.wishlistId;
  const cw = wishlists.find(w => w.id === wid) ?? null;

  // ── Expense groups state ──
  // Reuses match.groupId — expense-group and shopping-list-group routes
  // never overlap (distinguished by `screen`), so a second route field
  // would just duplicate this one.
  const [expenseGroups, setExpenseGroups] = useState<ExpenseGroup[]>([]);
  const xgid = match.groupId;
  const cxg = expenseGroups.find(x => x.id === xgid) ?? null;
  const isExpenseGroupAdmin = cxg?.myRole === "ADMIN";
  // Read inside the realtime socket handlers below, which are only ever
  // (re)subscribed when xgid changes — not on every expenseGroups update —
  // so member-name lookups for the live-update toast need a fresh value
  // reached via a ref instead of the effect's own (stale) closure.
  const expenseGroupsRef = useRef(expenseGroups);
  expenseGroupsRef.current = expenseGroups;

  const showTabBar = screen === "groups" || screen === "expenseGroups" || screen === "wishlists" || screen === "profile";

  // ── Route guard ──
  // Keep the URL honest: bounce signed-out visitors off protected routes,
  // signed-in ones off the auth screens, and drop dead group links back home.
  const isStandardGroupScreen =
    screen === "lists" || screen === "list" || screen === "settings" || screen === "members" || screen === "invite";
  const isExpenseGroupScreen =
    screen === "expenseGroup" || screen === "expenseGroupSettings" ||
    screen === "expenseGroupMembers" || screen === "expenseGroupInvite";
  useEffect(() => {
    if (booting) return;
    // A shared wishlist link is public — reachable while signed out, and
    // while signed in too (an owner opening their own link) — never bounced.
    if (screen === "public-wishlist") return;
    const isAuthScreen = screen === "login" || screen === "register";
    if (!currentUser) {
      if (!isAuthScreen) navigate("/login", { replace: true });
      return;
    }
    if (isAuthScreen || screen === "unknown") {
      navigate("/groups", { replace: true });
      return;
    }
    // gid/xgid share the same route field (screen tells them apart), so each
    // dead-link check only fires on its own screen family.
    if (isStandardGroupScreen && gid && !cg) {
      navigate("/groups", { replace: true });
      return;
    }
    // The list itself can vanish out from under a viewer (someone else
    // deleted it) via a real-time event, not just their own action.
    if (gid && lid && !currentList) {
      navigate(`/groups/${gid}`, { replace: true });
      return;
    }
    if (wid && !cw) {
      navigate("/wishlists", { replace: true });
      return;
    }
    if (isExpenseGroupScreen && xgid && !cxg) {
      navigate("/expense-groups", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, currentUser, screen, gid, cg, lid, currentList, wid, cw, xgid, cxg]);

  // Real-time keeps things in sync while you're already looking at a list,
  // but landing on one fresh (from the lists screen, or straight back into
  // the same one) should never show stale data — refetch its group every time.
  useEffect(() => {
    if (!currentUser || !gid || !lid) return;
    apiGetGroup(gid)
      .then(g => setGroups(gs => gs.map(group => group.id !== gid ? group : mapGroup(g, currentUser.id))))
      .catch(() => {});
  }, [currentUser, gid, lid]);

  // ── Realtime ──
  // One socket per session; connected whenever there's an active session and
  // scoped to whichever group is currently open by joining/leaving its room.
  useEffect(() => {
    if (currentUser) connectSocket();
    else disconnectSocket();
  }, [currentUser?.id]);

  // Push notifications (native app only — no-ops on web for now). Re-run on
  // every login so a device switching accounts re-points its token.
  useEffect(() => {
    if (currentUser) initPushNotifications().catch(() => {});
  }, [currentUser?.id]);

  // Update check (native Android only — no-op elsewhere). Runs once per app
  // launch, before or after login, since it doesn't depend on a session.
  useEffect(() => {
    checkForUpdate().then(info => { if (info) setUpdateInfo(info); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!currentUser || !gid) return;
    const socket = getSocket();

    joinGroupRoom(gid);

    // Mobile disconnects constantly (backgrounding, screen lock, WiFi/
    // cellular handoff) — Socket.IO reconnects the transport on its own,
    // but the server has no memory of which rooms this new connection
    // should be in, so rejoin explicitly every time "connect" fires (not
    // just on mount) or live updates silently stop until a manual reload.
    function onConnect() {
      joinGroupRoom(gid);
    }
    socket.on("connect", onConnect);

    // If the app was backgrounded long enough for the socket to actually
    // die (not just idle), the browser/WebView won't always notice on its
    // own until something touches the network — nudge a reconnect as soon
    // as the app is foregrounded again.
    function onVisible() {
      if (document.visibilityState === "visible" && !socket.connected) {
        socket.connect();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    function patchGroup(updater: (g: Group) => Group) {
      setGroups(gs => gs.map(g => g.id !== gid ? g : updater(g)));
    }

    function onListCreated({ list }: { list: ApiList }) {
      patchGroup(g => g.lists.some(l => l.id === list.id) ? g : { ...g, lists: [...g.lists, mapList(list)] });
    }
    function onListDeleted({ listId }: { listId: string }) {
      patchGroup(g => ({ ...g, lists: g.lists.filter(l => l.id !== listId) }));
    }
    function onItemCreated({ listId, item }: { listId: string; item: ApiListItem }) {
      // Our own addItem() echoing back over the socket before its REST
      // response arrives — skip it here and let that response's own
      // reconciliation fold it into the existing optimistic row instead.
      if ((pendingItemCountsRef.current.get(pendingItemKey(listId, item.text)) ?? 0) > 0) return;
      patchGroup(g => ({
        ...g,
        lists: g.lists.map(l => l.id !== listId || l.items.some(i => i.id === item.id) ? l : { ...l, items: [...l.items, mapItem(item)] }),
      }));
    }
    function onItemUpdated({ listId, item }: { listId: string; item: ApiListItem }) {
      patchGroup(g => ({
        ...g,
        lists: g.lists.map(l => l.id !== listId ? l : { ...l, items: l.items.map(i => i.id === item.id ? mapItem(item) : i) }),
      }));
    }
    function onItemDeleted({ listId, itemId }: { listId: string; itemId: string }) {
      patchGroup(g => ({
        ...g,
        lists: g.lists.map(l => l.id !== listId ? l : { ...l, items: l.items.filter(i => i.id !== itemId) }),
      }));
    }
    function onItemsReordered({ listId, itemIds }: { listId: string; itemIds: string[] }) {
      patchGroup(g => ({
        ...g,
        lists: g.lists.map(l => l.id !== listId ? l : { ...l, items: reorderItemsArray(l.items, itemIds) }),
      }));
    }

    socket.on("list:created", onListCreated);
    socket.on("list:deleted", onListDeleted);
    socket.on("item:created", onItemCreated);
    socket.on("item:updated", onItemUpdated);
    socket.on("item:deleted", onItemDeleted);
    socket.on("items:reordered", onItemsReordered);

    return () => {
      socket.off("connect", onConnect);
      document.removeEventListener("visibilitychange", onVisible);
      socket.off("list:created", onListCreated);
      socket.off("list:deleted", onListDeleted);
      socket.off("item:created", onItemCreated);
      socket.off("item:updated", onItemUpdated);
      socket.off("item:deleted", onItemDeleted);
      socket.off("items:reordered", onItemsReordered);
      leaveGroupRoom(gid);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, gid]);

  // Live updates for whichever expense group is currently open — mirrors the
  // shopping-list effect above, but also surfaces a toast when the change
  // came from someone else (shopping-list items don't, since every checkbox
  // toggle would get noisy; an expense being logged/removed is rarer and
  // worth flagging).
  useEffect(() => {
    if (!currentUser || !xgid) return;
    const socket = getSocket();

    joinGroupRoom(xgid);

    function onConnect() {
      joinGroupRoom(xgid);
    }
    socket.on("connect", onConnect);

    function patchExpenseGroup(updater: (g: ExpenseGroup) => ExpenseGroup) {
      setExpenseGroups(gs => gs.map(g => g.id !== xgid ? g : updater(g)));
    }

    function actorName(userId: string): string {
      const group = expenseGroupsRef.current.find(g => g.id === xgid);
      return group?.members.find(m => m.id === userId)?.name ?? t("common.someone");
    }

    function onExpenseCreated({ groupId, expense }: { groupId: string; expense: ApiExpense }) {
      if (groupId !== xgid) return;
      patchExpenseGroup(g => g.expenses.some(e => e.id === expense.id) ? g : { ...g, expenses: [...g.expenses, mapExpense(expense)] });
      if (expense.createdById && expense.createdById !== currentUser.id) {
        notify(t("toast.expenseAddedLive", { name: actorName(expense.createdById), description: expense.description }));
      }
    }
    function onExpenseUpdated({ groupId, expense, updatedById }: { groupId: string; expense: ApiExpense; updatedById: string }) {
      if (groupId !== xgid) return;
      patchExpenseGroup(g => ({ ...g, expenses: g.expenses.map(e => e.id === expense.id ? mapExpense(expense) : e) }));
      if (updatedById !== currentUser.id) {
        notify(t("toast.expenseUpdatedLive", { name: actorName(updatedById), description: expense.description }));
      }
    }
    function onExpenseDeleted({ groupId, expenseId, deletedById }: { groupId: string; expenseId: string; deletedById: string }) {
      if (groupId !== xgid) return;
      patchExpenseGroup(g => ({ ...g, expenses: g.expenses.filter(e => e.id !== expenseId) }));
      if (deletedById !== currentUser.id) {
        notify(t("toast.expenseDeletedLive", { name: actorName(deletedById) }));
      }
    }
    function onSettlementCreated({ groupId, settlement }: { groupId: string; settlement: ApiSettlement }) {
      if (groupId !== xgid) return;
      patchExpenseGroup(g => g.settlements.some(s => s.id === settlement.id) ? g : { ...g, settlements: [...g.settlements, mapSettlement(settlement)] });
      if (settlement.createdById && settlement.createdById !== currentUser.id) {
        notify(t("toast.settlementAddedLive", { name: actorName(settlement.createdById) }));
      }
    }
    function onSettlementDeleted({ groupId, settlementId, deletedById }: { groupId: string; settlementId: string; deletedById: string }) {
      if (groupId !== xgid) return;
      patchExpenseGroup(g => ({ ...g, settlements: g.settlements.filter(s => s.id !== settlementId) }));
      if (deletedById !== currentUser.id) {
        notify(t("toast.settlementDeletedLive", { name: actorName(deletedById) }));
      }
    }

    socket.on("expense:created", onExpenseCreated);
    socket.on("expense:updated", onExpenseUpdated);
    socket.on("expense:deleted", onExpenseDeleted);
    socket.on("settlement:created", onSettlementCreated);
    socket.on("settlement:deleted", onSettlementDeleted);

    return () => {
      socket.off("connect", onConnect);
      socket.off("expense:created", onExpenseCreated);
      socket.off("expense:updated", onExpenseUpdated);
      socket.off("expense:deleted", onExpenseDeleted);
      socket.off("settlement:created", onSettlementCreated);
      socket.off("settlement:deleted", onSettlementDeleted);
      leaveGroupRoom(xgid);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, xgid]);

  // ── Overlay visibility ──
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  // ── Toast ──
  const [toastMsg, setToastMsg] = useState("");
  const [toastShow, setToastShow] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function notify(m: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(m);
    setToastShow(true);
    toastTimer.current = setTimeout(() => setToastShow(false), 2500);
  }

  // ── Create group ──
  const [cName, setCName] = useState("");
  const [cEmoji, setCEmoji] = useState("📋");
  const [cCurrency, setCCurrency] = useState("USD");
  const [creating, setCreating] = useState(false);

  async function doCreate() {
    const name = cName.trim();
    if (!name) return;
    if (!currentUser) { notify(t("toast.sessionMissing")); return; }
    setCreating(true);
    try {
      const g = await apiCreateGroup(name, cEmoji, cCurrency);
      setGroups(gs => [...gs, mapGroup(g, currentUser.id)]);
      setCName(""); setCEmoji("📋"); setCCurrency("USD"); setCreateOpen(false);
      notify(t("toast.created", { name }));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("toast.couldNotCreateGroup"));
    } finally {
      setCreating(false);
    }
  }

  // ── Edit group ──
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [egName, setEgName] = useState("");
  const [egEmoji, setEgEmoji] = useState("📋");
  const [egCurrency, setEgCurrency] = useState("USD");
  const [egSaving, setEgSaving] = useState(false);

  function openEditGroup() {
    if (!cg) return;
    setEgName(cg.name);
    setEgEmoji(cg.emoji);
    setEgCurrency(cg.defaultCurrency);
    setEditGroupOpen(true);
  }

  async function doEditGroup() {
    const name = egName.trim();
    if (!gid || !name) return;
    setEgSaving(true);
    try {
      const g = await apiUpdateGroup(gid, { name, emoji: egEmoji, defaultCurrency: egCurrency });
      setGroups(gs => gs.map(x => x.id !== gid ? x : { ...x, name: g.name, emoji: g.emoji, defaultCurrency: g.defaultCurrency }));
      setEditGroupOpen(false);
      notify(t("toast.groupUpdated"));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("toast.couldNotUpdateGroup"));
    } finally {
      setEgSaving(false);
    }
  }

  // ── Join group ──
  const [jCode, setJCode] = useState("");
  const [jStatus, setJStatus] = useState<JoinStatus>("idle");
  const [jErr, setJErr] = useState("");

  function resetJoin() { setJCode(""); setJStatus("idle"); setJErr(""); }

  async function doJoin() {
    const code = jCode.trim().toUpperCase();
    if (!code) return;
    if (!currentUser) { notify(t("toast.sessionMissing")); return; }
    setJStatus("loading");
    try {
      const g = await apiJoinGroup(code);
      setGroups(gs => [...gs, mapGroup(g, currentUser.id)]);
      setJStatus("success");
      setTimeout(() => {
        setJoinOpen(false); resetJoin();
        notify(t("toast.joined", { name: g.name }));
      }, 1200);
    } catch (e) {
      setJStatus("error");
      setJErr(e instanceof ApiError ? e.message : t("toast.invalidCode"));
    }
  }

  // ── Wishlists ──
  const [wCreateOpen, setWCreateOpen] = useState(false);
  const [wName, setWName] = useState("");
  const [wEmoji, setWEmoji] = useState("🎁");
  const [wCreating, setWCreating] = useState(false);
  const [wShareOpen, setWShareOpen] = useState(false);
  const [wRegenerating, setWRegenerating] = useState(false);
  const [wRegenConfirmOpen, setWRegenConfirmOpen] = useState(false);
  const [wDeleteOpen, setWDeleteOpen] = useState(false);

  async function doCreateWishlist() {
    const name = wName.trim();
    if (!name) return;
    setWCreating(true);
    try {
      const w = await apiCreateWishlist(name, wEmoji);
      const mapped = mapWishlist(w);
      setWishlists(ws => [...ws, mapped]);
      setWName(""); setWEmoji("🎁"); setWCreateOpen(false);
      navigate(`/wishlists/${mapped.id}`);
      notify(t("toast.created", { name }));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("toast.couldNotCreateWishlist"));
    } finally {
      setWCreating(false);
    }
  }

  async function doRegenerateWishlistLink() {
    if (!wid) return;
    setWRegenerating(true);
    try {
      const { shareToken } = await apiRegenerateWishlistShareLink(wid);
      setWishlists(ws => ws.map(w => w.id !== wid ? w : { ...w, shareToken }));
      notify(t("toast.newLinkGenerated"));
    } catch {
      notify(t("toast.couldNotGenerateLink"));
    } finally {
      setWRegenerating(false);
      setWRegenConfirmOpen(false);
    }
  }

  const [wEditOpen, setWEditOpen] = useState(false);
  const [weName, setWeName] = useState("");
  const [weEmoji, setWeEmoji] = useState("🎁");
  const [weSaving, setWeSaving] = useState(false);

  function openEditWishlist() {
    if (!cw) return;
    setWeName(cw.name);
    setWeEmoji(cw.emoji);
    setWShareOpen(false);
    setWEditOpen(true);
  }

  async function doEditWishlist() {
    const name = weName.trim();
    if (!wid || !name) return;
    setWeSaving(true);
    try {
      const w = await apiUpdateWishlist(wid, { name, emoji: weEmoji });
      setWishlists(ws => ws.map(x => x.id !== wid ? x : {
        ...x, name: w.name, emoji: w.emoji,
        list: x.list ? { ...x.list, name: w.name } : x.list,
      }));
      setWEditOpen(false);
      notify(t("toast.wishlistUpdated"));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("toast.couldNotUpdateWishlist"));
    } finally {
      setWeSaving(false);
    }
  }

  async function doDeleteWishlist() {
    if (!wid) return;
    try {
      await apiDeleteWishlist(wid);
      setWishlists(ws => ws.filter(w => w.id !== wid));
      notify(t("toast.wishlistDeleted"));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("toast.couldNotDeleteWishlist"));
    } finally {
      setWDeleteOpen(false);
      navigate("/wishlists", { replace: true });
    }
  }

  // ── Expense groups ──
  // Mirrors the Groups/Wishlists state blocks above rather than sharing
  // their handlers — same reasoning as Wishlists already not reusing
  // Groups' create/edit/leave/delete state: each resource's mutations are
  // only a handful of lines, and keeping them separate avoids threading a
  // "which kind of group" branch through every one of them.
  const [xgCreateOpen, setXgCreateOpen] = useState(false);
  const [xgName, setXgName] = useState("");
  const [xgEmoji, setXgEmoji] = useState("💰");
  const [xgCurrency, setXgCurrency] = useState("USD");
  const [xgCreating, setXgCreating] = useState(false);

  async function doCreateExpenseGroup() {
    const name = xgName.trim();
    if (!name) return;
    if (!currentUser) { notify(t("toast.sessionMissing")); return; }
    setXgCreating(true);
    try {
      const g = await apiCreateExpenseGroup(name, xgEmoji, xgCurrency);
      const mapped = mapExpenseGroup(g, currentUser.id);
      setExpenseGroups(gs => [...gs, mapped]);
      setXgName(""); setXgEmoji("💰"); setXgCurrency("USD"); setXgCreateOpen(false);
      navigate(`/expense-groups/${mapped.id}`);
      notify(t("toast.created", { name }));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("toast.couldNotCreateGroup"));
    } finally {
      setXgCreating(false);
    }
  }

  const [xgJoinOpen, setXgJoinOpen] = useState(false);
  const [xgJoinCode, setXgJoinCode] = useState("");
  const [xgJoinStatus, setXgJoinStatus] = useState<JoinStatus>("idle");
  const [xgJoinErr, setXgJoinErr] = useState("");

  function resetJoinExpenseGroup() { setXgJoinCode(""); setXgJoinStatus("idle"); setXgJoinErr(""); }

  async function doJoinExpenseGroup() {
    const code = xgJoinCode.trim().toUpperCase();
    if (!code) return;
    if (!currentUser) { notify(t("toast.sessionMissing")); return; }
    setXgJoinStatus("loading");
    try {
      const g = await apiJoinExpenseGroup(code);
      setExpenseGroups(gs => [...gs, mapExpenseGroup(g, currentUser.id)]);
      setXgJoinStatus("success");
      setTimeout(() => {
        setXgJoinOpen(false); resetJoinExpenseGroup();
        notify(t("toast.joined", { name: g.name }));
      }, 1200);
    } catch (e) {
      setXgJoinStatus("error");
      setXgJoinErr(e instanceof ApiError ? e.message : t("toast.invalidCode"));
    }
  }

  const [xgEditOpen, setXgEditOpen] = useState(false);
  const [xgeName, setXgeName] = useState("");
  const [xgeEmoji, setXgeEmoji] = useState("💰");
  const [xgeCurrency, setXgeCurrency] = useState("USD");
  const [xgeSaving, setXgeSaving] = useState(false);

  function openEditExpenseGroup() {
    if (!cxg) return;
    setXgeName(cxg.name);
    setXgeEmoji(cxg.emoji);
    setXgeCurrency(cxg.defaultCurrency);
    setXgEditOpen(true);
  }

  async function doEditExpenseGroup() {
    const name = xgeName.trim();
    if (!xgid || !name) return;
    setXgeSaving(true);
    try {
      const g = await apiUpdateExpenseGroup(xgid, { name, emoji: xgeEmoji, defaultCurrency: xgeCurrency });
      setExpenseGroups(gs => gs.map(x => x.id !== xgid ? x : { ...x, name: g.name, emoji: g.emoji, defaultCurrency: g.defaultCurrency }));
      setXgEditOpen(false);
      notify(t("toast.groupUpdated"));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("toast.couldNotUpdateGroup"));
    } finally {
      setXgeSaving(false);
    }
  }

  async function regenExpenseGroupCode() {
    if (!xgid) return;
    try {
      const { inviteCode } = await apiRegenerateExpenseGroupInvite(xgid);
      setExpenseGroups(gs => gs.map(g => g.id !== xgid ? g : { ...g, inviteCode }));
      notify(t("toast.newCodeGenerated"));
    } catch {
      notify(t("toast.couldNotGenerateCode"));
    }
  }

  const [xgRemoveTarget, setXgRemoveTarget] = useState<Member | null>(null);

  async function confirmRemoveExpenseGroupMember() {
    if (!xgid || !xgRemoveTarget) return;
    const target = xgRemoveTarget;
    try {
      await apiRemoveExpenseGroupMember(xgid, target.id);
      setExpenseGroups(gs => gs.map(g => g.id !== xgid ? g : { ...g, members: g.members.filter(m => m.id !== target.id) }));
      notify(t("toast.removed", { name: target.name }));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("toast.couldNotRemoveMember"));
    } finally {
      setXgRemoveTarget(null);
    }
  }

  const [xgLeaveOpen, setXgLeaveOpen] = useState(false);

  async function leaveExpenseGroupFn() {
    if (!xgid) return;
    try {
      await apiLeaveExpenseGroup(xgid);
      setExpenseGroups(gs => gs.filter(g => g.id !== xgid));
      notify(t("toast.leftGroup"));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("toast.couldNotLeaveGroup"));
    } finally {
      setXgLeaveOpen(false);
      navigate("/expense-groups", { replace: true });
    }
  }

  const [xgDeleteOpen, setXgDeleteOpen] = useState(false);

  async function doDeleteExpenseGroup() {
    if (!xgid) return;
    try {
      await apiDeleteExpenseGroup(xgid);
      setExpenseGroups(gs => gs.filter(g => g.id !== xgid));
      notify(t("toast.groupDeleted"));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("toast.couldNotDeleteGroup"));
    } finally {
      setXgDeleteOpen(false);
      navigate("/expense-groups", { replace: true });
    }
  }

  // ── Add / edit / delete expense ──
  // One sheet + one set of fields serves both add and edit — editingExpenseId
  // null means "add", set means "edit that expense" (mirrors how the group
  // create/edit sheets already share styling but not state; here the form
  // itself is identical between the two modes, so it's the state that's shared).
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [aeDescription, setAeDescription] = useState("");
  const [aeAmount, setAeAmount] = useState("");
  const [aeCurrency, setAeCurrency] = useState("USD");
  const [aePaidById, setAePaidById] = useState("");
  const [aeParticipantIds, setAeParticipantIds] = useState<string[]>([]);
  const [aeSaving, setAeSaving] = useState(false);

  function openAddExpense() {
    if (!cxg || !currentUser) return;
    setEditingExpenseId(null);
    setAeDescription("");
    setAeAmount("");
    setAeCurrency(cxg.defaultCurrency);
    setAePaidById(currentUser.id);
    setAeParticipantIds(cxg.members.map(m => m.id));
    setAddExpenseOpen(true);
  }

  function openEditExpense(expense: ExpenseVM) {
    setEditingExpenseId(expense.id);
    setAeDescription(expense.description);
    setAeAmount(String(expense.amount));
    setAeCurrency(expense.currency);
    setAePaidById(expense.paidById);
    setAeParticipantIds(expense.splits.map(s => s.userId));
    setAddExpenseOpen(true);
  }

  async function doSaveExpense() {
    const description = aeDescription.trim();
    const amount = Number(aeAmount);
    if (!xgid || !description || !Number.isFinite(amount) || amount <= 0 || !aePaidById || aeParticipantIds.length === 0) return;
    setAeSaving(true);
    try {
      if (editingExpenseId) {
        await apiUpdateExpense(xgid, editingExpenseId, {
          description, amount, currency: aeCurrency, paidById: aePaidById, participantIds: aeParticipantIds,
        });
      } else {
        await apiAddExpense(xgid, {
          description, amount, currency: aeCurrency, paidById: aePaidById, participantIds: aeParticipantIds,
        });
      }
      if (currentUser) await refreshExpenseGroups(currentUser.id);
      setAddExpenseOpen(false);
      notify(editingExpenseId ? t("toast.expenseUpdated") : t("toast.expenseAdded"));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t(editingExpenseId ? "toast.couldNotUpdateExpense" : "toast.couldNotAddExpense"));
    } finally {
      setAeSaving(false);
    }
  }

  const [deleteExpenseTarget, setDeleteExpenseTarget] = useState<ExpenseVM | null>(null);

  async function confirmDeleteExpense() {
    if (!xgid || !deleteExpenseTarget) return;
    const target = deleteExpenseTarget;
    try {
      await apiDeleteExpense(xgid, target.id);
      setExpenseGroups(gs => gs.map(g => g.id !== xgid ? g : { ...g, expenses: g.expenses.filter(e => e.id !== target.id) }));
      notify(t("toast.expenseDeleted"));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("toast.couldNotDeleteExpense"));
    } finally {
      setDeleteExpenseTarget(null);
    }
  }

  // ── Settle up ──
  const [settleUpOpen, setSettleUpOpen] = useState(false);
  const [suFromUserId, setSuFromUserId] = useState("");
  const [suToUserId, setSuToUserId] = useState("");
  const [suAmount, setSuAmount] = useState("");
  const [suCurrency, setSuCurrency] = useState("USD");
  const [suSaving, setSuSaving] = useState(false);

  function openSettleUp() {
    if (!cxg || !currentUser) return;
    const others = cxg.members.filter(m => m.id !== currentUser.id);
    setSuFromUserId(currentUser.id);
    setSuToUserId(others[0]?.id ?? "");
    setSuAmount("");
    setSuCurrency(cxg.defaultCurrency);
    setSettleUpOpen(true);
  }

  async function doSaveSettlement() {
    const amount = Number(suAmount);
    if (!xgid || !suFromUserId || !suToUserId || suFromUserId === suToUserId || !Number.isFinite(amount) || amount <= 0) return;
    setSuSaving(true);
    try {
      const settlement = await apiAddSettlement(xgid, { fromUserId: suFromUserId, toUserId: suToUserId, amount, currency: suCurrency });
      setExpenseGroups(gs => gs.map(g => g.id !== xgid || g.settlements.some(s => s.id === settlement.id)
        ? g : { ...g, settlements: [...g.settlements, mapSettlement(settlement)] }));
      setSettleUpOpen(false);
      notify(t("toast.settlementAdded"));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("toast.couldNotAddSettlement"));
    } finally {
      setSuSaving(false);
    }
  }

  const [deleteSettlementTarget, setDeleteSettlementTarget] = useState<SettlementVM | null>(null);

  async function confirmDeleteSettlement() {
    if (!xgid || !deleteSettlementTarget) return;
    const target = deleteSettlementTarget;
    try {
      await apiDeleteSettlement(xgid, target.id);
      setExpenseGroups(gs => gs.map(g => g.id !== xgid ? g : { ...g, settlements: g.settlements.filter(s => s.id !== target.id) }));
      notify(t("toast.settlementDeleted"));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("toast.couldNotDeleteSettlement"));
    } finally {
      setDeleteSettlementTarget(null);
    }
  }

  // ── Lists ──
  const [addListOpen, setAddListOpen] = useState(false);
  const [addListGroupId, setAddListGroupId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [deleteListTarget, setDeleteListTarget] = useState<{ groupId: string; listId: string; name: string } | null>(null);

  function openAddList(groupId: string) {
    setAddListGroupId(groupId);
    const dateLabel = format(new Date(), "MMM d", { locale: i18n.language === "hy" ? hyLocale : undefined });
    setNewListName(t("listsScreen.defaultListName", { date: dateLabel }));
    setAddListOpen(true);
  }

  async function doCreateList() {
    const name = newListName.trim();
    const targetGroupId = addListGroupId;
    if (!targetGroupId || !name) return;
    setCreatingList(true);
    try {
      const l = await apiCreateList(targetGroupId, name);
      // The realtime list:created echo can beat this response back (it
      // travels over an already-open socket vs. a full HTTP round-trip) and
      // add the list first — don't append a second copy if so.
      setGroups(gs => gs.map(g => {
        if (g.id !== targetGroupId) return g;
        if (g.lists.some(existing => existing.id === l.id)) return g;
        return { ...g, lists: [...g.lists, mapList(l)] };
      }));
      setAddListOpen(false);
      navigate(`/groups/${targetGroupId}/list/${l.id}`);
      notify(t("toast.created", { name }));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("toast.couldNotCreateList"));
    } finally {
      setCreatingList(false);
    }
  }

  async function confirmDeleteList() {
    if (!deleteListTarget) return;
    const { groupId, listId, name } = deleteListTarget;
    try {
      await apiDeleteList(groupId, listId);
      setGroups(gs => gs.map(g => g.id !== groupId ? g : { ...g, lists: g.lists.filter(l => l.id !== listId) }));
      notify(t("toast.deleted", { name }));
      if (lid === listId) navigate(`/groups/${groupId}`, { replace: true });
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("toast.couldNotDeleteList"));
    } finally {
      setDeleteListTarget(null);
    }
  }

  // ── Bonus cards ──
  const [addBonusCardOpen, setAddBonusCardOpen] = useState(false);
  const [addBonusCardGroupId, setAddBonusCardGroupId] = useState<string | null>(null);
  const [newBonusCardName, setNewBonusCardName] = useState("");
  const [newBonusCardImage, setNewBonusCardImage] = useState<string | null>(null);
  const [compressingBonusImage, setCompressingBonusImage] = useState(false);
  const [savingBonusCard, setSavingBonusCard] = useState(false);
  const bonusCardFileInputRef = useRef<HTMLInputElement>(null);

  function openAddBonusCard(groupId: string) {
    setAddBonusCardGroupId(groupId);
    setNewBonusCardName("");
    setNewBonusCardImage(null);
    setAddBonusCardOpen(true);
  }

  async function handleBonusCardFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setCompressingBonusImage(true);
    try {
      setNewBonusCardImage(await compressImageToDataUrl(file));
    } catch {
      notify(t("toast.couldNotProcessPhoto"));
    } finally {
      setCompressingBonusImage(false);
    }
  }

  async function doAddBonusCard() {
    const name = newBonusCardName.trim();
    const targetGroupId = addBonusCardGroupId;
    if (!targetGroupId || !name || !newBonusCardImage) return;
    setSavingBonusCard(true);
    try {
      const card = await apiAddBonusCard(targetGroupId, name, newBonusCardImage);
      setGroups(gs => gs.map(g => g.id !== targetGroupId ? g : { ...g, bonusCards: [...g.bonusCards, mapBonusCard(card)] }));
      setAddBonusCardOpen(false);
      notify(t("toast.added", { name }));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("toast.couldNotAddBonusCard"));
    } finally {
      setSavingBonusCard(false);
    }
  }

  function deleteBonusCard(cardId: string) {
    if (!gid) return;
    const prevCards = cg?.bonusCards ?? [];

    setGroups(gs => gs.map(g => g.id !== gid ? g : { ...g, bonusCards: g.bonusCards.filter(c => c.id !== cardId) }));

    apiDeleteBonusCard(gid, cardId).catch(() => {
      setGroups(gs => gs.map(g => g.id !== gid ? g : { ...g, bonusCards: prevCards }));
      notify(t("toast.couldNotDeleteBonusCard"));
    });
  }

  // ── Modal/back-button coordination ──
  // Every Sheet/Confirm above is just an overlay on top of the current
  // route, not its own route — so both the in-app back chevron and the
  // Android hardware back button should dismiss whichever one is open
  // before they touch navigation at all, matching how a native app back
  // press is expected to behave.
  const anyModalOpen = createOpen || joinOpen || editGroupOpen || addListOpen || addBonusCardOpen
    || leaveOpen || deleteGroupOpen || logoutOpen || !!removeTarget || !!deleteListTarget
    || wCreateOpen || wShareOpen || wEditOpen || wRegenConfirmOpen || wDeleteOpen || !!updateInfo
    || xgCreateOpen || xgJoinOpen || xgEditOpen || xgLeaveOpen || xgDeleteOpen || !!xgRemoveTarget
    || addExpenseOpen || !!deleteExpenseTarget || settleUpOpen || !!deleteSettlementTarget;

  function closeAllModals() {
    setCreateOpen(false);
    setJoinOpen(false);
    setEditGroupOpen(false);
    setAddListOpen(false);
    setAddBonusCardOpen(false);
    setLeaveOpen(false);
    setDeleteGroupOpen(false);
    setLogoutOpen(false);
    setRemoveTarget(null);
    setDeleteListTarget(null);
    setWCreateOpen(false);
    setWShareOpen(false);
    setWEditOpen(false);
    setWRegenConfirmOpen(false);
    setWDeleteOpen(false);
    setXgCreateOpen(false);
    setXgJoinOpen(false);
    setXgEditOpen(false);
    setXgLeaveOpen(false);
    setXgDeleteOpen(false);
    setXgRemoveTarget(null);
    setAddExpenseOpen(false);
    setDeleteExpenseTarget(null);
    setSettleUpOpen(false);
    setDeleteSettlementTarget(null);
    dismissUpdatePrompt();
  }

  function dismissUpdatePrompt() {
    if (updateInfo) dismissUpdate(updateInfo.versionCode);
    setUpdateInfo(null);
  }

  function downloadUpdate() {
    if (updateInfo) window.open(updateInfo.url, "_blank");
    dismissUpdatePrompt();
  }

  anyModalOpenRef.current = anyModalOpen;
  closeAllModalsRef.current = closeAllModals;

  // ── List item mutations ──
  function toggleItem(id: string) {
    if (!gid || !lid) return;
    const list = cg?.lists.find(l => l.id === lid);
    const prevItem = list?.items.find(i => i.id === id);
    if (!prevItem) return;
    const nextCompleted = !prevItem.completed;

    setGroups(gs => gs.map(g => g.id !== gid ? g : {
      ...g,
      lists: g.lists.map(l => l.id !== lid ? l : {
        ...l,
        items: l.items.map(i => i.id !== id ? i : {
          ...i, completed: nextCompleted, completedAt: nextCompleted ? Date.now() : undefined,
        }),
      }),
    }));

    apiUpdateItem(lid, id, { completed: nextCompleted }).catch(() => {
      setGroups(gs => gs.map(g => g.id !== gid ? g : {
        ...g,
        lists: g.lists.map(l => l.id !== lid ? l : { ...l, items: l.items.map(i => i.id !== id ? i : prevItem) }),
      }));
      notify(t("toast.couldNotUpdateItem"));
    });
  }

  function editItemText(id: string, text: string) {
    if (!gid || !lid) return;
    const list = cg?.lists.find(l => l.id === lid);
    const prevItem = list?.items.find(i => i.id === id);
    if (!prevItem || prevItem.text === text) return;

    setGroups(gs => gs.map(g => g.id !== gid ? g : {
      ...g,
      lists: g.lists.map(l => l.id !== lid ? l : {
        ...l,
        items: l.items.map(i => i.id !== id ? i : { ...i, text }),
      }),
    }));

    apiUpdateItem(lid, id, { text }).catch(() => {
      setGroups(gs => gs.map(g => g.id !== gid ? g : {
        ...g,
        lists: g.lists.map(l => l.id !== lid ? l : { ...l, items: l.items.map(i => i.id !== id ? i : prevItem) }),
      }));
      notify(t("toast.couldNotUpdateItem"));
    });
  }

  function setItemImage(id: string, imageUrl: string) {
    if (!gid || !lid) return;
    const list = cg?.lists.find(l => l.id === lid);
    const prevItem = list?.items.find(i => i.id === id);
    if (!prevItem) return;

    setGroups(gs => gs.map(g => g.id !== gid ? g : {
      ...g,
      lists: g.lists.map(l => l.id !== lid ? l : {
        ...l,
        items: l.items.map(i => i.id !== id ? i : { ...i, imageUrl }),
      }),
    }));

    apiUpdateItem(lid, id, { imageUrl }).catch(() => {
      setGroups(gs => gs.map(g => g.id !== gid ? g : {
        ...g,
        lists: g.lists.map(l => l.id !== lid ? l : { ...l, items: l.items.map(i => i.id !== id ? i : prevItem) }),
      }));
      notify(t("toast.couldNotAddPhoto"));
    });
  }

  function setItemPrice(id: string, price: number | null, currency?: string) {
    if (!gid || !lid) return;
    const list = cg?.lists.find(l => l.id === lid);
    const prevItem = list?.items.find(i => i.id === id);
    if (!prevItem) return;
    const nextCurrency = price == null ? undefined : (currency ?? prevItem.currency);

    setGroups(gs => gs.map(g => g.id !== gid ? g : {
      ...g,
      lists: g.lists.map(l => l.id !== lid ? l : {
        ...l,
        items: l.items.map(i => i.id !== id ? i : { ...i, price: price ?? undefined, currency: nextCurrency }),
      }),
    }));

    apiUpdateItem(lid, id, { price, currency }).catch(() => {
      setGroups(gs => gs.map(g => g.id !== gid ? g : {
        ...g,
        lists: g.lists.map(l => l.id !== lid ? l : { ...l, items: l.items.map(i => i.id !== id ? i : prevItem) }),
      }));
      notify(t("toast.couldNotUpdateItem"));
    });
  }

  // Fires live as the user drags (updates local order immediately for a
  // smooth visual re-sort); the actual PATCH only goes out once, from
  // commitItemsReorder, when the drag gesture ends.
  function reorderItemsPreview(orderedIds: string[]) {
    if (!gid || !lid) return;
    setGroups(gs => gs.map(g => g.id !== gid ? g : {
      ...g,
      lists: g.lists.map(l => l.id !== lid ? l : { ...l, items: reorderItemsArray(l.items, orderedIds) }),
    }));
  }

  function commitItemsReorder() {
    if (!gid || !lid) return;
    const list = cg?.lists.find(l => l.id === lid);
    if (!list) return;
    const orderedIds = list.items.filter(i => !i.completed).map(i => i.id);
    apiReorderItems(lid, orderedIds).catch(() => notify(t("toast.couldNotReorderItems")));
  }

  function addItem(text: string, imageUrl?: string, price?: number, currency?: string) {
    if (!gid || !lid) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticItem: ListItem = { id: tempId, clientId: tempId, text, imageUrl, price, currency, completed: false };

    // Mark this text as "pending" for this list so the realtime handler
    // recognizes and drops the echo of this same submission instead of
    // rendering a second row for it. Counted, not boolean, so adding the
    // same text twice concurrently doesn't have one resolving clear the
    // flag out from under the other still-pending submission.
    const pendingKey = pendingItemKey(lid, text);
    pendingItemCountsRef.current.set(pendingKey, (pendingItemCountsRef.current.get(pendingKey) ?? 0) + 1);

    setGroups(gs => gs.map(g => g.id !== gid ? g : {
      ...g, lists: g.lists.map(l => l.id !== lid ? l : { ...l, items: [...l.items, optimisticItem] }),
    }));

    function clearPending() {
      const remaining = (pendingItemCountsRef.current.get(pendingKey) ?? 1) - 1;
      if (remaining <= 0) pendingItemCountsRef.current.delete(pendingKey);
      else pendingItemCountsRef.current.set(pendingKey, remaining);
    }

    apiAddItem(lid, text, imageUrl, price, currency)
      .then(item => {
        clearPending();
        setGroups(gs => gs.map(g => g.id !== gid ? g : {
          ...g,
          lists: g.lists.map(l => l.id !== lid ? l : {
            ...l,
            items: l.items
              // In case the echo still slipped in ahead of us (e.g. another
              // tab's list:created for the same list), drop that duplicate
              // rather than keep both rows.
              .filter(i => i.clientId === tempId || i.id !== item.id)
              // keep clientId stable (= tempId) so the row doesn't remount and replay its enter animation
              .map(i => i.clientId === tempId ? { ...mapItem(item), clientId: tempId } : i),
          }),
        }));
      })
      .catch(() => {
        clearPending();
        setGroups(gs => gs.map(g => g.id !== gid ? g : {
          ...g,
          lists: g.lists.map(l => l.id !== lid ? l : { ...l, items: l.items.filter(i => i.id !== tempId) }),
        }));
        notify(t("toast.couldNotAddItem"));
      });
  }

  function deleteItemFn(id: string) {
    if (!gid || !lid) return;
    const list = cg?.lists.find(l => l.id === lid);
    const idx = list?.items.findIndex(i => i.id === id) ?? -1;
    if (!list || idx === -1) return;
    const prevItem = list.items[idx];

    setGroups(gs => gs.map(g => g.id !== gid ? g : {
      ...g,
      lists: g.lists.map(l => l.id !== lid ? l : { ...l, items: l.items.filter(i => i.id !== id) }),
    }));

    apiDeleteItem(lid, id).catch(() => {
      setGroups(gs => gs.map(g => g.id !== gid ? g : {
        ...g,
        lists: g.lists.map(l => {
          if (l.id !== lid) return l;
          const items = [...l.items];
          items.splice(idx, 0, prevItem);
          return { ...l, items };
        }),
      }));
      notify(t("toast.couldNotDeleteItem"));
    });
  }

  // ── Wishlist item mutations ── (same shape as the group ones above, keyed
  // by wid/cw instead of gid/cg — a wishlist's list is always cw.list.)
  function toggleWishlistItem(id: string) {
    if (!wid || !cw?.list) return;
    const listId = cw.list.id;
    const prevItem = cw.list.items.find(i => i.id === id);
    if (!prevItem) return;
    const nextCompleted = !prevItem.completed;

    setWishlists(ws => ws.map(w => w.id !== wid || !w.list ? w : {
      ...w,
      list: { ...w.list, items: w.list.items.map(i => i.id !== id ? i : { ...i, completed: nextCompleted, completedAt: nextCompleted ? Date.now() : undefined }) },
    }));

    apiUpdateItem(listId, id, { completed: nextCompleted }).catch(() => {
      setWishlists(ws => ws.map(w => w.id !== wid || !w.list ? w : {
        ...w, list: { ...w.list, items: w.list.items.map(i => i.id !== id ? i : prevItem) },
      }));
      notify(t("toast.couldNotUpdateItem"));
    });
  }

  function editWishlistItemText(id: string, text: string) {
    if (!wid || !cw?.list) return;
    const listId = cw.list.id;
    const prevItem = cw.list.items.find(i => i.id === id);
    if (!prevItem || prevItem.text === text) return;

    setWishlists(ws => ws.map(w => w.id !== wid || !w.list ? w : {
      ...w, list: { ...w.list, items: w.list.items.map(i => i.id !== id ? i : { ...i, text }) },
    }));

    apiUpdateItem(listId, id, { text }).catch(() => {
      setWishlists(ws => ws.map(w => w.id !== wid || !w.list ? w : {
        ...w, list: { ...w.list, items: w.list.items.map(i => i.id !== id ? i : prevItem) },
      }));
      notify(t("toast.couldNotUpdateItem"));
    });
  }

  function setWishlistItemImage(id: string, imageUrl: string) {
    if (!wid || !cw?.list) return;
    const listId = cw.list.id;
    const prevItem = cw.list.items.find(i => i.id === id);
    if (!prevItem) return;

    setWishlists(ws => ws.map(w => w.id !== wid || !w.list ? w : {
      ...w, list: { ...w.list, items: w.list.items.map(i => i.id !== id ? i : { ...i, imageUrl }) },
    }));

    apiUpdateItem(listId, id, { imageUrl }).catch(() => {
      setWishlists(ws => ws.map(w => w.id !== wid || !w.list ? w : {
        ...w, list: { ...w.list, items: w.list.items.map(i => i.id !== id ? i : prevItem) },
      }));
      notify(t("toast.couldNotAddPhoto"));
    });
  }

  function reorderWishlistItemsPreview(orderedIds: string[]) {
    if (!wid || !cw?.list) return;
    setWishlists(ws => ws.map(w => w.id !== wid || !w.list ? w : {
      ...w, list: { ...w.list, items: reorderItemsArray(w.list.items, orderedIds) },
    }));
  }

  function commitWishlistItemsReorder() {
    if (!wid || !cw?.list) return;
    const listId = cw.list.id;
    const orderedIds = cw.list.items.filter(i => !i.completed).map(i => i.id);
    apiReorderItems(listId, orderedIds).catch(() => notify(t("toast.couldNotReorderItems")));
  }

  function addWishlistItem(text: string, imageUrl?: string) {
    if (!wid || !cw?.list) return;
    const listId = cw.list.id;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticItem: ListItem = { id: tempId, clientId: tempId, text, imageUrl, completed: false };

    setWishlists(ws => ws.map(w => w.id !== wid || !w.list ? w : { ...w, list: { ...w.list, items: [...w.list.items, optimisticItem] } }));

    apiAddItem(listId, text, imageUrl)
      .then(item => {
        setWishlists(ws => ws.map(w => w.id !== wid || !w.list ? w : {
          ...w,
          list: { ...w.list, items: w.list.items.map(i => i.clientId === tempId ? { ...mapItem(item), clientId: tempId } : i) },
        }));
      })
      .catch(() => {
        setWishlists(ws => ws.map(w => w.id !== wid || !w.list ? w : { ...w, list: { ...w.list, items: w.list.items.filter(i => i.id !== tempId) } }));
        notify(t("toast.couldNotAddItem"));
      });
  }

  function deleteWishlistItemFn(id: string) {
    if (!wid || !cw?.list) return;
    const listId = cw.list.id;
    const idx = cw.list.items.findIndex(i => i.id === id);
    if (idx === -1) return;
    const prevItem = cw.list.items[idx];

    setWishlists(ws => ws.map(w => w.id !== wid || !w.list ? w : { ...w, list: { ...w.list, items: w.list.items.filter(i => i.id !== id) } }));

    apiDeleteItem(listId, id).catch(() => {
      setWishlists(ws => ws.map(w => {
        if (w.id !== wid || !w.list) return w;
        const items = [...w.list.items];
        items.splice(idx, 0, prevItem);
        return { ...w, list: { ...w.list, items } };
      }));
      notify(t("toast.couldNotDeleteItem"));
    });
  }

  async function regenCode() {
    if (!gid) return;
    try {
      const { inviteCode } = await apiRegenerateInvite(gid);
      setGroups(gs => gs.map(g => g.id !== gid ? g : { ...g, inviteCode }));
      notify(t("toast.newCodeGenerated"));
    } catch {
      notify(t("toast.couldNotGenerateCode"));
    }
  }

  async function confirmRemoveMember() {
    if (!gid || !removeTarget) return;
    const target = removeTarget;
    try {
      await apiRemoveMember(gid, target.id);
      setGroups(gs => gs.map(g => g.id !== gid ? g : { ...g, members: g.members.filter(m => m.id !== target.id) }));
      notify(t("toast.removed", { name: target.name }));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("toast.couldNotRemoveMember"));
    } finally {
      setRemoveTarget(null);
    }
  }

  // ── Leave / logout ──
  async function leaveGroup() {
    if (!gid) return;
    try {
      await apiLeaveGroup(gid);
      setGroups(gs => gs.filter(g => g.id !== gid));
      notify(t("toast.leftGroup"));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("toast.couldNotLeaveGroup"));
    } finally {
      setLeaveOpen(false);
      navigate("/groups", { replace: true });
    }
  }

  async function doDeleteGroup() {
    if (!gid) return;
    try {
      await apiDeleteGroup(gid);
      setGroups(gs => gs.filter(g => g.id !== gid));
      notify(t("toast.groupDeleted"));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("toast.couldNotDeleteGroup"));
    } finally {
      setDeleteGroupOpen(false);
      navigate("/groups", { replace: true });
    }
  }

  async function logout() {
    setLogoutOpen(false);
    await apiLogout().catch(() => {});
    setCurrentUser(null);
    setGroups([]);
    setWishlists([]);
    setExpenseGroups([]);
    navigate("/login", { replace: true });
    routedInitialScreen.current = false;
    runBootstrap();
  }

  // ── Render ──
  return (
    <div className={dark ? "dark" : ""} style={{ width: "100%", height: "100%" }}>
      {/* Outer stage — full-bleed, no phone-frame mockup chrome */}
      <div className="w-full h-full">
        {/* position:relative so absolute overlays stay inside */}
        <div
          className="relative bg-background overflow-hidden"
          style={{ width: "100%", height: "100%", paddingTop: TOP_INSET }}
        >
          {screen === "public-wishlist" ? (
            <PublicWishlistScreen shareToken={match.shareToken ?? ""} />
          ) : booting ? (
            <BootSplash error={bootError} onRetry={runBootstrap} />
          ) : (
            <>
              {/* Screen layer */}
              <PullToRefresh onRefresh={handlePullRefresh}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={location.pathname}
                  className="absolute inset-0 flex flex-col overflow-hidden"
                  style={{
                    borderRadius: "inherit",
                    paddingTop: TOP_INSET,
                    paddingBottom: showTabBar
                      ? `calc(${NAV_HEIGHT}px + ${SAFE_AREA_BOTTOM})`
                      : SAFE_AREA_BOTTOM,
                  }}
                  initial={{ opacity: 0, x: dir * 36 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: dir * -36 }}
                  transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  {screen === "login" && (
                    <LoginScreen
                      showBack={canGoBack}
                      onBack={back}
                      onSuccess={handleAuthSuccess}
                      onGoRegister={() => navigate("/register")}
                      onContinueAsGuest={handleContinueAsGuest}
                      guestLoading={guestLoading}
                    />
                  )}
                  {screen === "register" && (
                    <RegisterScreen
                      onBack={back}
                      onSuccess={handleAuthSuccess}
                      onGoLogin={() => navigate("/login")}
                    />
                  )}
                  {screen === "groups" && (
                    <Groups
                      groups={groups}
                      onOpen={id => navigate(`/groups/${id}`)}
                      onOpenActiveList={(groupId, listId) => navigate(`/groups/${groupId}/list/${listId}`)}
                      onAddList={openAddList}
                      onCreate={() => setCreateOpen(true)}
                      onJoin={() => setJoinOpen(true)}
                    />
                  )}
                  {screen === "wishlists" && (
                    <WishlistsScreen
                      wishlists={wishlists}
                      onOpen={id => navigate(`/wishlists/${id}`)}
                      onCreate={() => setWCreateOpen(true)}
                    />
                  )}
                  {screen === "wishlist" && cw && cw.list && (
                    <ListScreen
                      group={{
                        id: cw.id, name: cw.name, emoji: cw.emoji,
                        members: [], bonusCards: [], inviteCode: "", myRole: "ADMIN",
                        defaultCurrency: "USD",
                        lists: [cw.list],
                      }}
                      list={cw.list} onBack={back}
                      onToggle={toggleWishlistItem} onEdit={editWishlistItemText}
                      onAdd={addWishlistItem} onDeleteItem={deleteWishlistItemFn}
                      onSetImage={setWishlistItemImage}
                      onShare={() => setWShareOpen(true)}
                      onRename={openEditWishlist}
                      onDelete={() => setWDeleteOpen(true)}
                      onReorderPreview={reorderWishlistItemsPreview}
                      onReorderCommit={commitWishlistItemsReorder}
                    />
                  )}
                  {screen === "profile" && currentUser && (
                    <ProfileScreen
                      user={currentUser} theme={themeMode} onTheme={setThemeMode}
                      onGoLogin={() => navigate("/login")} onLogout={() => setLogoutOpen(true)}
                    />
                  )}
                  {screen === "lists" && cg && (
                    <ListsScreen
                      group={cg}
                      onOpenList={id => navigate(`/groups/${gid}/list/${id}`)}
                      onDeleteList={(listId, name) => gid && setDeleteListTarget({ groupId: gid, listId, name })}
                      onAddList={() => gid && openAddList(gid)}
                      onSettings={() => navigate(`/groups/${gid}/settings`)}
                      onBack={back}
                      onAddBonusCard={() => gid && openAddBonusCard(gid)}
                      onDeleteBonusCard={deleteBonusCard}
                    />
                  )}
                  {screen === "list" && cg && currentList && (
                    <ListScreen
                      group={cg} list={currentList} onBack={back}
                      onToggle={toggleItem} onEdit={editItemText} onAdd={addItem} onDeleteItem={deleteItemFn}
                      onSetImage={setItemImage}
                      onAddBonusCard={() => gid && openAddBonusCard(gid)}
                      onDeleteBonusCard={deleteBonusCard}
                      onReorderPreview={reorderItemsPreview}
                      onReorderCommit={commitItemsReorder}
                      enablePrice onSetPrice={setItemPrice}
                    />
                  )}
                  {screen === "members" && cg && (
                    <MembersScreen
                      group={cg} isAdmin={isAdmin} onBack={back}
                      onRemove={m => setRemoveTarget(m)}
                    />
                  )}
                  {screen === "invite" && cg && <InviteScreen group={cg} onBack={back} onNewCode={regenCode} />}
                  {screen === "settings" && cg && (
                    <SettingsScreen
                      group={cg} isAdmin={isAdmin} onBack={back}
                      onEdit={() => openEditGroup()}
                      onMembers={() => navigate(`/groups/${gid}/members`)} onInvite={() => navigate(`/groups/${gid}/invite`)}
                      onLeave={() => setLeaveOpen(true)}
                      onDelete={() => setDeleteGroupOpen(true)}
                    />
                  )}
                  {screen === "expenseGroups" && (
                    <ExpenseGroupsScreen
                      groups={expenseGroups}
                      onOpen={id => navigate(`/expense-groups/${id}`)}
                      onCreate={() => setXgCreateOpen(true)}
                      onJoin={() => setXgJoinOpen(true)}
                    />
                  )}
                  {screen === "expenseGroup" && cxg && (
                    <ExpenseGroupScreen
                      group={cxg} onBack={back}
                      onSettings={() => navigate(`/expense-groups/${xgid}/settings`)}
                      onAddExpense={openAddExpense}
                      onEditExpense={openEditExpense}
                      onDeleteExpense={setDeleteExpenseTarget}
                      onSettleUp={openSettleUp}
                      onDeleteSettlement={setDeleteSettlementTarget}
                    />
                  )}
                  {screen === "expenseGroupMembers" && cxg && (
                    <MembersScreen
                      group={cxg} isAdmin={!!isExpenseGroupAdmin} onBack={back}
                      onRemove={m => setXgRemoveTarget(m)}
                    />
                  )}
                  {screen === "expenseGroupInvite" && cxg && (
                    <InviteScreen group={cxg} onBack={back} onNewCode={regenExpenseGroupCode} />
                  )}
                  {screen === "expenseGroupSettings" && cxg && (
                    <SettingsScreen
                      group={cxg} isAdmin={!!isExpenseGroupAdmin} onBack={back}
                      onEdit={openEditExpenseGroup}
                      onMembers={() => navigate(`/expense-groups/${xgid}/members`)}
                      onInvite={() => navigate(`/expense-groups/${xgid}/invite`)}
                      onLeave={() => setXgLeaveOpen(true)}
                      onDelete={() => setXgDeleteOpen(true)}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
              </PullToRefresh>

              {showTabBar && (
                <BottomNav
                  active={
                    screen === "profile" ? "profile"
                    : screen === "wishlists" ? "wishlists"
                    : screen === "expenseGroups" ? "expenseGroups"
                    : "groups"
                  }
                  onChange={tab => navigate(tab === "expenseGroups" ? "/expense-groups" : `/${tab}`)}
                />
              )}

              {/* ── Overlays — absolute, contained in phone frame ── */}

              <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title={t("sheets.createGroup.title")}>
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-3">{t("common.chooseIcon")}</p>
                    <div className="grid grid-cols-5 gap-2">
                      {EMOJIS.map(e => (
                        <button
                          key={e} onClick={() => setCEmoji(e)}
                          className={`h-12 rounded-xl flex items-center justify-center text-2xl transition-all ${
                            cEmoji === e
                              ? "bg-primary/15 border-2 border-primary scale-[1.05]"
                              : "bg-muted border-2 border-transparent hover:bg-muted/80"
                          }`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Field
                    label={t("sheets.createGroup.nameLabel")}
                    placeholder={t("sheets.createGroup.namePlaceholder")}
                    value={cName}
                    onChange={e => setCName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && doCreate()}
                    autoFocus
                  />
                  <CurrencyField label={t("sheets.createGroup.currencyLabel")} value={cCurrency} onChange={setCCurrency} />
                  <div className="flex gap-3">
                    <Btn variant="outline" full onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Btn>
                    <Btn variant="primary" full onClick={doCreate} loading={creating} disabled={!cName.trim()}>{t("sheets.createGroup.submit")}</Btn>
                  </div>
                </div>
              </Sheet>

              <Sheet open={editGroupOpen} onClose={() => setEditGroupOpen(false)} title={t("sheets.editGroup.title")}>
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-3">{t("common.chooseIcon")}</p>
                    <div className="grid grid-cols-5 gap-2">
                      {EMOJIS.map(e => (
                        <button
                          key={e} onClick={() => setEgEmoji(e)}
                          className={`h-12 rounded-xl flex items-center justify-center text-2xl transition-all ${
                            egEmoji === e
                              ? "bg-primary/15 border-2 border-primary scale-[1.05]"
                              : "bg-muted border-2 border-transparent hover:bg-muted/80"
                          }`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Field
                    label={t("sheets.editGroup.nameLabel")}
                    placeholder={t("sheets.editGroup.namePlaceholder")}
                    value={egName}
                    onChange={e => setEgName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && doEditGroup()}
                    autoFocus
                  />
                  <CurrencyField label={t("sheets.editGroup.currencyLabel")} value={egCurrency} onChange={setEgCurrency} />
                  <div className="flex gap-3">
                    <Btn variant="outline" full onClick={() => setEditGroupOpen(false)}>{t("common.cancel")}</Btn>
                    <Btn variant="primary" full onClick={doEditGroup} loading={egSaving} disabled={!egName.trim()}>{t("sheets.editGroup.submit")}</Btn>
                  </div>
                </div>
              </Sheet>

              <Sheet open={joinOpen} onClose={() => { setJoinOpen(false); resetJoin(); }} title={t("sheets.joinGroup.title")}>
                <div className="space-y-5">
                  {jStatus !== "success" ? (
                    <>
                      <Field
                        label={t("sheets.joinGroup.codeLabel")}
                        placeholder={t("sheets.joinGroup.codePlaceholder")}
                        value={jCode}
                        onChange={e => { setJCode(e.target.value.toUpperCase()); setJStatus("idle"); setJErr(""); }}
                        onKeyDown={e => e.key === "Enter" && doJoin()}
                        error={jErr || undefined}
                        autoFocus
                        style={{ letterSpacing: "0.12em", fontFamily: "'DM Mono', monospace", textTransform: "uppercase" }}
                      />
                      <div className="bg-primary/8 rounded-xl px-4 py-3 flex items-start gap-2.5">
                        <span className="text-base mt-0.5">💡</span>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {t("sheets.joinGroup.hint")}
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <Btn variant="outline" full onClick={() => { setJoinOpen(false); resetJoin(); }}>{t("common.cancel")}</Btn>
                        <Btn variant="primary" full onClick={doJoin} loading={jStatus === "loading"} disabled={!jCode.trim()}>
                          {t("sheets.joinGroup.submit")}
                        </Btn>
                      </div>
                    </>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center gap-4 py-8"
                    >
                      <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
                        <CheckCircle2 className="w-9 h-9 text-emerald-500" />
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-foreground text-lg">{t("sheets.joinGroup.joinedTitle")}</p>
                        <p className="text-sm text-muted-foreground mt-1">{t("sheets.joinGroup.joinedBody")}</p>
                      </div>
                    </motion.div>
                  )}
                </div>
              </Sheet>

              <Sheet open={wCreateOpen} onClose={() => setWCreateOpen(false)} title={t("sheets.createWishlist.title")}>
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-3">{t("common.chooseIcon")}</p>
                    <div className="grid grid-cols-5 gap-2">
                      {WISHLIST_EMOJIS.map(e => (
                        <button
                          key={e} onClick={() => setWEmoji(e)}
                          className={`h-12 rounded-xl flex items-center justify-center text-2xl transition-all ${
                            wEmoji === e
                              ? "bg-primary/15 border-2 border-primary scale-[1.05]"
                              : "bg-muted border-2 border-transparent hover:bg-muted/80"
                          }`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Field
                    label={t("sheets.createWishlist.nameLabel")}
                    placeholder={t("sheets.createWishlist.namePlaceholder")}
                    value={wName}
                    onChange={e => setWName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && doCreateWishlist()}
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <Btn variant="outline" full onClick={() => setWCreateOpen(false)}>{t("common.cancel")}</Btn>
                    <Btn variant="primary" full onClick={doCreateWishlist} loading={wCreating} disabled={!wName.trim()}>{t("sheets.createWishlist.submit")}</Btn>
                  </div>
                </div>
              </Sheet>

              <Sheet open={wEditOpen} onClose={() => setWEditOpen(false)} title={t("sheets.editWishlist.title")}>
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-3">{t("common.chooseIcon")}</p>
                    <div className="grid grid-cols-5 gap-2">
                      {WISHLIST_EMOJIS.map(e => (
                        <button
                          key={e} onClick={() => setWeEmoji(e)}
                          className={`h-12 rounded-xl flex items-center justify-center text-2xl transition-all ${
                            weEmoji === e
                              ? "bg-primary/15 border-2 border-primary scale-[1.05]"
                              : "bg-muted border-2 border-transparent hover:bg-muted/80"
                          }`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Field
                    label={t("sheets.editWishlist.nameLabel")}
                    placeholder={t("sheets.editWishlist.namePlaceholder")}
                    value={weName}
                    onChange={e => setWeName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && doEditWishlist()}
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <Btn variant="outline" full onClick={() => setWEditOpen(false)}>{t("common.cancel")}</Btn>
                    <Btn variant="primary" full onClick={doEditWishlist} loading={weSaving} disabled={!weName.trim()}>{t("sheets.editWishlist.submit")}</Btn>
                  </div>
                </div>
              </Sheet>

              <Sheet open={wShareOpen} onClose={() => setWShareOpen(false)} title={t("sheets.shareWishlist.title")}>
                <div className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    {t("sheets.shareWishlist.body")}
                  </p>
                  {cw?.shareToken && (
                    <div className="bg-muted rounded-xl px-4 py-3 break-all text-xs font-mono text-foreground">
                      {getWishlistShareUrl(cw.shareToken)}
                    </div>
                  )}
                  <div className="flex gap-3">
                    <Btn
                      variant="outline" full
                      onClick={() => {
                        if (!cw?.shareToken) return;
                        const url = getWishlistShareUrl(cw.shareToken);
                        navigator.clipboard.writeText(url).catch(() => {});
                        notify(t("toast.linkCopied"));
                      }}
                    >
                      <Copy className="w-4 h-4" />
                      {t("sheets.shareWishlist.copy")}
                    </Btn>
                    <Btn
                      variant="primary" full
                      onClick={async () => {
                        if (!cw?.shareToken) return;
                        const url = getWishlistShareUrl(cw.shareToken);
                        const result = await shareWishlistLink(cw.name, url);
                        if (result === "copied") notify(t("toast.linkCopied"));
                      }}
                    >
                      <Share2 className="w-4 h-4" />
                      {t("sheets.shareWishlist.share")}
                    </Btn>
                  </div>
                  <button
                    onClick={() => setWRegenConfirmOpen(true)}
                    disabled={wRegenerating}
                    className="w-full flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {wRegenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    {t("sheets.shareWishlist.generateNewLink")}
                  </button>
                </div>
              </Sheet>

              <Sheet open={addListOpen} onClose={() => setAddListOpen(false)} title={t("sheets.addList.title")}>
                <div className="space-y-5">
                  <Field
                    label={t("sheets.addList.nameLabel")}
                    placeholder={t("sheets.addList.namePlaceholder")}
                    value={newListName}
                    onChange={e => setNewListName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && doCreateList()}
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <Btn variant="outline" full onClick={() => setAddListOpen(false)}>{t("common.cancel")}</Btn>
                    <Btn variant="primary" full onClick={doCreateList} loading={creatingList} disabled={!newListName.trim()}>
                      {t("sheets.addList.submit")}
                    </Btn>
                  </div>
                </div>
              </Sheet>

              <Sheet open={addBonusCardOpen} onClose={() => setAddBonusCardOpen(false)} title={t("sheets.addBonusCard.title")}>
                <div className="space-y-5">
                  <Field
                    label={t("sheets.addBonusCard.nameLabel")}
                    placeholder={t("sheets.addBonusCard.namePlaceholder")}
                    value={newBonusCardName}
                    onChange={e => setNewBonusCardName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && doAddBonusCard()}
                    autoFocus
                  />
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-3">{t("sheets.addBonusCard.imageLabel")}</p>
                    <input
                      ref={bonusCardFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleBonusCardFileChange}
                      className="hidden"
                    />
                    {newBonusCardImage ? (
                      <button
                        type="button"
                        onClick={() => bonusCardFileInputRef.current?.click()}
                        className="relative w-full h-32 rounded-2xl overflow-hidden border border-border"
                      >
                        <img src={newBonusCardImage} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <span className="text-xs font-semibold text-white">{t("common.tapToChange")}</span>
                        </div>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => bonusCardFileInputRef.current?.click()}
                        disabled={compressingBonusImage}
                        className="w-full h-32 rounded-2xl border-2 border-dashed border-border bg-muted/40 flex flex-col items-center justify-center gap-1.5 text-muted-foreground disabled:opacity-60"
                      >
                        {compressingBonusImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                        <span className="text-xs font-semibold">{compressingBonusImage ? t("common.processing") : t("common.choosePhoto")}</span>
                      </button>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <Btn variant="outline" full onClick={() => setAddBonusCardOpen(false)}>{t("common.cancel")}</Btn>
                    <Btn
                      variant="primary" full onClick={doAddBonusCard} loading={savingBonusCard}
                      disabled={!newBonusCardName.trim() || !newBonusCardImage}
                    >
                      {t("sheets.addBonusCard.submit")}
                    </Btn>
                  </div>
                </div>
              </Sheet>

              <Sheet open={xgCreateOpen} onClose={() => setXgCreateOpen(false)} title={t("sheets.createExpenseGroup.title")}>
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-3">{t("common.chooseIcon")}</p>
                    <div className="grid grid-cols-5 gap-2">
                      {EXPENSE_EMOJIS.map(e => (
                        <button
                          key={e} onClick={() => setXgEmoji(e)}
                          className={`h-12 rounded-xl flex items-center justify-center text-2xl transition-all ${
                            xgEmoji === e
                              ? "bg-primary/15 border-2 border-primary scale-[1.05]"
                              : "bg-muted border-2 border-transparent hover:bg-muted/80"
                          }`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Field
                    label={t("sheets.createExpenseGroup.nameLabel")}
                    placeholder={t("sheets.createExpenseGroup.namePlaceholder")}
                    value={xgName}
                    onChange={e => setXgName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && doCreateExpenseGroup()}
                    autoFocus
                  />
                  <CurrencyField label={t("sheets.createExpenseGroup.currencyLabel")} value={xgCurrency} onChange={setXgCurrency} />
                  <div className="flex gap-3">
                    <Btn variant="outline" full onClick={() => setXgCreateOpen(false)}>{t("common.cancel")}</Btn>
                    <Btn variant="primary" full onClick={doCreateExpenseGroup} loading={xgCreating} disabled={!xgName.trim()}>{t("sheets.createExpenseGroup.submit")}</Btn>
                  </div>
                </div>
              </Sheet>

              <Sheet open={xgEditOpen} onClose={() => setXgEditOpen(false)} title={t("sheets.editExpenseGroup.title")}>
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-3">{t("common.chooseIcon")}</p>
                    <div className="grid grid-cols-5 gap-2">
                      {EXPENSE_EMOJIS.map(e => (
                        <button
                          key={e} onClick={() => setXgeEmoji(e)}
                          className={`h-12 rounded-xl flex items-center justify-center text-2xl transition-all ${
                            xgeEmoji === e
                              ? "bg-primary/15 border-2 border-primary scale-[1.05]"
                              : "bg-muted border-2 border-transparent hover:bg-muted/80"
                          }`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Field
                    label={t("sheets.editExpenseGroup.nameLabel")}
                    placeholder={t("sheets.editExpenseGroup.namePlaceholder")}
                    value={xgeName}
                    onChange={e => setXgeName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && doEditExpenseGroup()}
                    autoFocus
                  />
                  <CurrencyField label={t("sheets.editExpenseGroup.currencyLabel")} value={xgeCurrency} onChange={setXgeCurrency} />
                  <div className="flex gap-3">
                    <Btn variant="outline" full onClick={() => setXgEditOpen(false)}>{t("common.cancel")}</Btn>
                    <Btn variant="primary" full onClick={doEditExpenseGroup} loading={xgeSaving} disabled={!xgeName.trim()}>{t("sheets.editExpenseGroup.submit")}</Btn>
                  </div>
                </div>
              </Sheet>

              <Sheet open={xgJoinOpen} onClose={() => { setXgJoinOpen(false); resetJoinExpenseGroup(); }} title={t("sheets.joinExpenseGroup.title")}>
                <div className="space-y-5">
                  {xgJoinStatus !== "success" ? (
                    <>
                      <Field
                        label={t("sheets.joinGroup.codeLabel")}
                        placeholder={t("sheets.joinGroup.codePlaceholder")}
                        value={xgJoinCode}
                        onChange={e => { setXgJoinCode(e.target.value.toUpperCase()); setXgJoinStatus("idle"); setXgJoinErr(""); }}
                        onKeyDown={e => e.key === "Enter" && doJoinExpenseGroup()}
                        error={xgJoinErr || undefined}
                        autoFocus
                        style={{ letterSpacing: "0.12em", fontFamily: "'DM Mono', monospace", textTransform: "uppercase" }}
                      />
                      <div className="flex gap-3">
                        <Btn variant="outline" full onClick={() => { setXgJoinOpen(false); resetJoinExpenseGroup(); }}>{t("common.cancel")}</Btn>
                        <Btn variant="primary" full onClick={doJoinExpenseGroup} loading={xgJoinStatus === "loading"} disabled={!xgJoinCode.trim()}>
                          {t("sheets.joinGroup.submit")}
                        </Btn>
                      </div>
                    </>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center gap-4 py-8"
                    >
                      <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
                        <CheckCircle2 className="w-9 h-9 text-emerald-500" />
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-foreground text-lg">{t("sheets.joinGroup.joinedTitle")}</p>
                        <p className="text-sm text-muted-foreground mt-1">{t("sheets.joinGroup.joinedBody")}</p>
                      </div>
                    </motion.div>
                  )}
                </div>
              </Sheet>

              <Sheet
                open={addExpenseOpen} onClose={() => setAddExpenseOpen(false)}
                title={editingExpenseId ? t("sheets.editExpense.title") : t("sheets.addExpense.title")}
              >
                <div className="space-y-4">
                  <Field
                    label={t("sheets.addExpense.descriptionLabel")}
                    placeholder={t("sheets.addExpense.descriptionPlaceholder")}
                    value={aeDescription}
                    onChange={e => setAeDescription(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Field
                        label={t("sheets.addExpense.amountLabel")}
                        placeholder="0"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={aeAmount}
                        onChange={e => setAeAmount(e.target.value)}
                      />
                    </div>
                    <div className="w-24 flex-shrink-0">
                      <CurrencyField label={t("sheets.addExpense.currencyLabel")} value={aeCurrency} onChange={setAeCurrency} />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <MemberField
                      label={t("sheets.addExpense.paidByLabel")}
                      members={cxg?.members ?? []}
                      value={aePaidById}
                      onChange={setAePaidById}
                    />
                    <MemberMultiField
                      label={t("sheets.addExpense.splitBetweenLabel")}
                      members={cxg?.members ?? []}
                      value={aeParticipantIds}
                      onChange={setAeParticipantIds}
                    />
                  </div>
                  <div className="flex gap-3">
                    <Btn variant="outline" full onClick={() => setAddExpenseOpen(false)}>{t("common.cancel")}</Btn>
                    <Btn
                      variant="primary" full onClick={doSaveExpense} loading={aeSaving}
                      disabled={!aeDescription.trim() || !(Number(aeAmount) > 0) || !aePaidById || aeParticipantIds.length === 0}
                    >
                      {editingExpenseId ? t("common.save") : t("sheets.addExpense.submit")}
                    </Btn>
                  </div>
                </div>
              </Sheet>

              <Sheet open={settleUpOpen} onClose={() => setSettleUpOpen(false)} title={t("sheets.settleUp.title")}>
                <div className="space-y-5">
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <Field
                        label={t("sheets.settleUp.amountLabel")}
                        placeholder="0"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={suAmount}
                        onChange={e => setSuAmount(e.target.value)}
                        autoFocus
                      />
                    </div>
                  </div>
                  <CurrencyField label={t("sheets.settleUp.currencyLabel")} value={suCurrency} onChange={setSuCurrency} />
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-3">{t("sheets.settleUp.fromLabel")}</p>
                    <div className="flex flex-wrap gap-2">
                      {cxg?.members.map(m => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSuFromUserId(m.id)}
                          className={`flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border-2 transition-all ${
                            suFromUserId === m.id
                              ? "bg-primary/15 border-primary"
                              : "bg-muted border-transparent hover:bg-muted/80"
                          }`}
                        >
                          <Avatar m={m} size="xs" />
                          <span className="text-xs font-semibold text-foreground">{m.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-3">{t("sheets.settleUp.toLabel")}</p>
                    <div className="flex flex-wrap gap-2">
                      {cxg?.members.filter(m => m.id !== suFromUserId).map(m => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSuToUserId(m.id)}
                          className={`flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border-2 transition-all ${
                            suToUserId === m.id
                              ? "bg-primary/15 border-primary"
                              : "bg-muted border-transparent hover:bg-muted/80"
                          }`}
                        >
                          <Avatar m={m} size="xs" />
                          <span className="text-xs font-semibold text-foreground">{m.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Btn variant="outline" full onClick={() => setSettleUpOpen(false)}>{t("common.cancel")}</Btn>
                    <Btn
                      variant="primary" full onClick={doSaveSettlement} loading={suSaving}
                      disabled={!suFromUserId || !suToUserId || suFromUserId === suToUserId || !(Number(suAmount) > 0)}
                    >
                      {t("sheets.settleUp.submit")}
                    </Btn>
                  </div>
                </div>
              </Sheet>

              <Confirm
                open={leaveOpen} onClose={() => setLeaveOpen(false)}
                title={t("confirm.leaveGroup.title")}
                body={t("confirm.leaveGroup.body", { name: cg?.name })}
                cta={t("confirm.leaveGroup.cta")} danger onConfirm={leaveGroup}
              />

              <Confirm
                open={deleteGroupOpen} onClose={() => setDeleteGroupOpen(false)}
                title={t("confirm.deleteGroup.title")}
                body={t("confirm.deleteGroup.body", { name: cg?.name })}
                cta={t("confirm.deleteGroup.cta")} danger onConfirm={doDeleteGroup}
              />

              <Confirm
                open={!!removeTarget} onClose={() => setRemoveTarget(null)}
                title={t("confirm.removeMember.title")}
                body={t("confirm.removeMember.body", { memberName: removeTarget?.name, groupName: cg?.name })}
                cta={t("confirm.removeMember.cta")} danger onConfirm={confirmRemoveMember}
              />

              <Confirm
                open={!!deleteListTarget} onClose={() => setDeleteListTarget(null)}
                title={t("confirm.deleteList.title")}
                body={t("confirm.deleteList.body", { name: deleteListTarget?.name })}
                cta={t("confirm.deleteList.cta")} danger onConfirm={confirmDeleteList}
              />

              <Confirm
                open={wRegenConfirmOpen} onClose={() => setWRegenConfirmOpen(false)}
                title={t("confirm.regenerateLink.title")}
                body={t("confirm.regenerateLink.body")}
                cta={t("confirm.regenerateLink.cta")} danger onConfirm={doRegenerateWishlistLink}
              />

              <Confirm
                open={wDeleteOpen} onClose={() => setWDeleteOpen(false)}
                title={t("confirm.deleteWishlist.title")}
                body={t("confirm.deleteWishlist.body", { name: cw?.name })}
                cta={t("confirm.deleteWishlist.cta")} danger onConfirm={doDeleteWishlist}
              />

              <Confirm
                open={xgLeaveOpen} onClose={() => setXgLeaveOpen(false)}
                title={t("confirm.leaveGroup.title")}
                body={t("confirm.leaveGroup.body", { name: cxg?.name })}
                cta={t("confirm.leaveGroup.cta")} danger onConfirm={leaveExpenseGroupFn}
              />

              <Confirm
                open={xgDeleteOpen} onClose={() => setXgDeleteOpen(false)}
                title={t("confirm.deleteExpenseGroup.title")}
                body={t("confirm.deleteExpenseGroup.body", { name: cxg?.name })}
                cta={t("confirm.deleteExpenseGroup.cta")} danger onConfirm={doDeleteExpenseGroup}
              />

              <Confirm
                open={!!xgRemoveTarget} onClose={() => setXgRemoveTarget(null)}
                title={t("confirm.removeExpenseGroupMember.title")}
                body={t("confirm.removeExpenseGroupMember.body", { memberName: xgRemoveTarget?.name, groupName: cxg?.name })}
                cta={t("confirm.removeExpenseGroupMember.cta")} danger onConfirm={confirmRemoveExpenseGroupMember}
              />

              <Confirm
                open={!!deleteExpenseTarget} onClose={() => setDeleteExpenseTarget(null)}
                title={t("confirm.deleteExpense.title")}
                body={t("confirm.deleteExpense.body", { description: deleteExpenseTarget?.description })}
                cta={t("confirm.deleteExpense.cta")} danger onConfirm={confirmDeleteExpense}
              />

              <Confirm
                open={!!deleteSettlementTarget} onClose={() => setDeleteSettlementTarget(null)}
                title={t("confirm.deleteSettlement.title")}
                body={t("confirm.deleteSettlement.body", {
                  from: cxg?.members.find(m => m.id === deleteSettlementTarget?.fromUserId)?.name,
                  to: cxg?.members.find(m => m.id === deleteSettlementTarget?.toUserId)?.name,
                })}
                cta={t("confirm.deleteSettlement.cta")} danger onConfirm={confirmDeleteSettlement}
              />

              <Confirm
                open={!!updateInfo} onClose={dismissUpdatePrompt}
                title={t("confirm.updateAvailable.title")}
                body={t("confirm.updateAvailable.body")}
                cta={t("confirm.updateAvailable.cta")} onConfirm={downloadUpdate}
              />

              <Confirm
                open={logoutOpen} onClose={() => setLogoutOpen(false)}
                title={t("confirm.signOut.title")}
                body={t("confirm.signOut.body")}
                cta={t("confirm.signOut.cta")} onConfirm={logout}
              />

              <Toast msg={toastMsg} show={toastShow} />
            </>
          )}

          <GuestRecoveryPrompt
            candidate={recovery}
            loading={recoveryLoading}
            onAccept={handleRecoveryAccept}
            onDecline={handleRecoveryDecline}
          />
        </div>
      </div>
    </div>
  );
}
