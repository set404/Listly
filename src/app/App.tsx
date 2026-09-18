import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useNavigationType } from "react-router";
import { motion, AnimatePresence, animate } from "motion/react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { hy as hyLocale } from "date-fns/locale";
import {
  Copy, Share2, RefreshCw,
  Loader2, CheckCircle2, ImagePlus,
} from "lucide-react";
import { Btn, Field, Sheet, Confirm, Toast, Avatar, SAFE_AREA_BOTTOM, type Member, type ThemeMode } from "./components/ui-kit";
import { LoginScreen } from "./components/LoginScreen";
import { RegisterScreen } from "./components/RegisterScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { GuestRecoveryPrompt } from "./components/GuestRecoveryPrompt";
import { CurrencyField } from "./components/CurrencyField";
import { MemberField } from "./components/MemberField";
import { MemberMultiField } from "./components/MemberMultiField";
import { BottomNav } from "./components/BottomNav";
import { BootSplash } from "./components/BootSplash";
import { PullToRefresh } from "./components/PullToRefresh";
import { ScreenLoading } from "./components/ScreenLoading";
import { Groups } from "./components/Groups";
import { WishlistsScreen } from "./components/WishlistsScreen";
import { ExpenseGroupsScreen } from "./components/ExpenseGroupsScreen";
import { ExpenseGroupScreen } from "./components/ExpenseGroupScreen";
import { ListsScreen } from "./components/ListsScreen";
import { ListScreen } from "./components/ListScreen";
import { MembersScreen } from "./components/MembersScreen";
import { InviteScreen } from "./components/InviteScreen";
import { SettingsScreen } from "./components/SettingsScreen";
import { PublicWishlistScreen } from "./components/PublicWishlistScreen";
import {
  bootstrapSession, continueAsGuest, acceptRecovery, declineRecovery,
  type RecoveryCandidate,
} from "./lib/auth";
import {
  ApiError, type ApiUser, type ApiGroupSummary, type ApiList, type ApiListItem,
  type ApiWishlistSummary, type ApiExpense,
  type ApiExpenseGroupSummary, type ApiSettlement,
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
  getWishlist as apiGetWishlist,
  createWishlist as apiCreateWishlist,
  updateWishlist as apiUpdateWishlist,
  deleteWishlist as apiDeleteWishlist,
  regenerateWishlistShareLink as apiRegenerateWishlistShareLink,
  listExpenseGroups as apiListExpenseGroups,
  getExpenseGroup as apiGetExpenseGroup,
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
import { initPushNotifications } from "./lib/push";
import { checkForUpdate, dismissUpdate, type UpdateInfo } from "./lib/appUpdate";
import { hasPendingGoogleRedirect, completeGoogleRedirectSignIn } from "./lib/googleAuth";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { type Screen, parseRoute } from "./lib/routing";
import type {
  JoinStatus, ListItem, Group, Wishlist,
  ExpenseVM, SettlementVM, ExpenseGroup, SettleSuggestion,
} from "./types";
import {
  getWishlistShareUrl, shareWishlistLink,
  mapItem, mapList, reorderItemsArray, mapBonusCard,
  mapWishlistSummary, mapWishlist, mapGroupSummary, mapGroup,
  mapExpense, mapSettlement, mapExpenseGroupSummary, mapExpenseGroup,
} from "./lib/mappers";
import { compressImageToDataUrl } from "./lib/image";
import { TOP_INSET } from "./constants";

const EMOJIS = ["📋", "🏠", "🍱", "✈️", "🛒", "🎯", "📦", "🌿", "💼", "🎉"];
const WISHLIST_EMOJIS = ["🎁", "🎂", "💍", "🎄", "👶", "🏡", "🎓", "❤️", "✨", "🎉"];
const EXPENSE_EMOJIS = ["💰", "🧾", "💳", "🍽️", "🏠", "✈️", "🎉", "📊", "🤝", "💵"];

const NAV_HEIGHT = 68;

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

  // Applies a fresh tab-list summary on top of whatever's already in state,
  // preserving full detail (lists/expenses/etc.) for any entry that's
  // already loaded it — the lazy summary-fetch and detail-fetch effects
  // below can resolve in either order (e.g. a deep link straight into a
  // specific group fires both at once), so the summary fetch must never
  // blow away detail that already arrived.
  function mergeGroupSummary(existing: Group | undefined, g: ApiGroupSummary, currentUserId: string): Group {
    const summary = mapGroupSummary(g, currentUserId);
    if (!existing?.detailLoaded) return summary;
    return {
      ...existing,
      name: g.name, emoji: g.emoji, inviteCode: g.inviteCode, defaultCurrency: g.defaultCurrency,
      myRole: g.myRole, members: summary.members,
      listCount: g.listCount, activeListSummary: g.activeList, itemCounts: g.itemCounts,
    };
  }

  function mergeWishlistSummary(existing: Wishlist | undefined, w: ApiWishlistSummary): Wishlist {
    const summary = mapWishlistSummary(w);
    if (!existing?.detailLoaded) return summary;
    return { ...existing, name: w.name, emoji: w.emoji, itemCount: w.itemCount, doneCount: w.doneCount };
  }

  function mergeExpenseGroupSummary(existing: ExpenseGroup | undefined, g: ApiExpenseGroupSummary, currentUserId: string): ExpenseGroup {
    const summary = mapExpenseGroupSummary(g, currentUserId);
    if (!existing?.detailLoaded) return summary;
    return {
      ...existing,
      name: g.name, emoji: g.emoji, inviteCode: g.inviteCode, defaultCurrency: g.defaultCurrency,
      myRole: g.myRole, members: summary.members,
    };
  }

  // These fetch the lightweight tab-list shape only (see ApiGroupSummary and
  // friends) — never a specific group/wishlist/expense-group's full lists,
  // items, or expenses. Full detail is fetched separately, only for
  // whichever one resource is currently open (refreshGroupDetail etc.
  // below), so opening the app or pulling to refresh a tab doesn't pull
  // down every item/expense of every group you're in.
  async function refreshGroups(userId: string) {
    const list = await apiListGroups();
    setGroups(gs => {
      const byId = new Map(gs.map(g => [g.id, g]));
      return list.map(g => mergeGroupSummary(byId.get(g.id), g, userId));
    });
    return list.length;
  }

  async function refreshWishlists() {
    const list = await apiListWishlists();
    setWishlists(ws => {
      const byId = new Map(ws.map(w => [w.id, w]));
      return list.map(w => mergeWishlistSummary(byId.get(w.id), w));
    });
  }

  async function refreshExpenseGroups(userId: string) {
    const list = await apiListExpenseGroups();
    setExpenseGroups(gs => {
      const byId = new Map(gs.map(g => [g.id, g]));
      return list.map(g => mergeExpenseGroupSummary(byId.get(g.id), g, userId));
    });
  }

  // Full-detail refetch for one specific, currently-open resource — used by
  // the "fetch on enter" effects below and by mutations that need to see
  // their own effect reflected immediately (e.g. after adding an expense).
  // Upserts rather than only updating, since the detail fetch can resolve
  // before this resource's tab-list summary has ever been fetched (a deep
  // link straight into a specific group, for one).
  async function refreshGroupDetail(groupId: string) {
    if (!currentUser) return;
    const g = await apiGetGroup(groupId);
    const mapped = mapGroup(g, currentUser.id);
    setGroups(gs => gs.some(x => x.id === groupId) ? gs.map(x => x.id !== groupId ? x : mapped) : [...gs, mapped]);
  }

  async function refreshWishlistDetail(wishlistId: string) {
    const w = await apiGetWishlist(wishlistId);
    const mapped = mapWishlist(w);
    setWishlists(ws => ws.some(x => x.id === wishlistId) ? ws.map(x => x.id !== wishlistId ? x : mapped) : [...ws, mapped]);
  }

  async function refreshExpenseGroupDetail(groupId: string) {
    if (!currentUser) return;
    const g = await apiGetExpenseGroup(groupId);
    const mapped = mapExpenseGroup(g, currentUser.id);
    setExpenseGroups(gs => gs.some(x => x.id === groupId) ? gs.map(x => x.id !== groupId ? x : mapped) : [...gs, mapped]);
  }

  async function handlePullRefresh() {
    if (!currentUser) return;
    const tasks: Promise<unknown>[] = [
      refreshGroups(currentUser.id), refreshWishlists(), refreshExpenseGroups(currentUser.id),
    ];
    // Also refresh whichever specific resource is currently open, so
    // pulling to refresh while looking at a group/wishlist/expense group
    // updates what's actually on screen, not just the tab summaries.
    // gid/xgid share the same route field (screen tells them apart) — must
    // check the screen family, not just id truthiness, or opening an
    // expense group would also fire a STANDARD group detail request (and
    // vice versa) for the same id.
    if (gid && (screen === "groups" || isStandardGroupScreen)) tasks.push(refreshGroupDetail(gid));
    if (wid) tasks.push(refreshWishlistDetail(wid));
    if (xgid && (screen === "expenseGroups" || isExpenseGroupScreen)) tasks.push(refreshExpenseGroupDetail(xgid));
    await Promise.all(tasks).catch(() => notify(t("toast.refreshFailed")));
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
    enterApp(user);
    notify(t("toast.welcome", { name: user.name.split(" ")[0] }));
  }

  // ── Groups state ──
  const [groups, setGroups] = useState<Group[]>([]);
  // Whether the (lightweight) groups-tab list has been fetched at least
  // once this session — gates the dead-link route guard below so it
  // doesn't bounce a deep link back to /groups just because the fetch
  // that would populate `groups` hasn't resolved yet.
  const [groupsListLoaded, setGroupsListLoaded] = useState(false);
  const gid = match.groupId;
  const lid = match.listId;
  const cg = groups.find(g => g.id === gid) ?? null;
  const currentList = cg?.lists.find(l => l.id === lid) ?? null;
  const isAdmin = cg?.myRole === "ADMIN";

  // ── Wishlists state ──
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [wishlistsListLoaded, setWishlistsListLoaded] = useState(false);
  const wid = match.wishlistId;
  const cw = wishlists.find(w => w.id === wid) ?? null;

  // ── Expense groups state ──
  // Reuses match.groupId — expense-group and shopping-list-group routes
  // never overlap (distinguished by `screen`), so a second route field
  // would just duplicate this one.
  const [expenseGroups, setExpenseGroups] = useState<ExpenseGroup[]>([]);
  const [expenseGroupsListLoaded, setExpenseGroupsListLoaded] = useState(false);
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
    // dead-link check only fires on its own screen family. Each is also
    // gated on its tab's (lightweight) list having loaded at least once —
    // that list is now fetched lazily instead of always being ready by the
    // time booting finishes, so an empty array here can just mean "hasn't
    // loaded yet," not "doesn't exist."
    if (isStandardGroupScreen && gid && groupsListLoaded && !cg) {
      navigate("/groups", { replace: true });
      return;
    }
    // The list itself can vanish out from under a viewer (someone else
    // deleted it) via a real-time event, not just their own action. Only
    // checked once this group's full detail (the actual lists array) has
    // loaded — before that, cg.lists is legitimately empty.
    if (gid && lid && cg?.detailLoaded && !currentList) {
      navigate(`/groups/${gid}`, { replace: true });
      return;
    }
    if (wid && wishlistsListLoaded && !cw) {
      navigate("/wishlists", { replace: true });
      return;
    }
    if (isExpenseGroupScreen && xgid && expenseGroupsListLoaded && !cxg) {
      navigate("/expense-groups", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, currentUser, screen, gid, cg, lid, currentList, wid, cw, xgid, cxg, groupsListLoaded, wishlistsListLoaded, expenseGroupsListLoaded]);

  // ── Lazy tab-list fetches ──
  // The groups/wishlists/expense-groups tab lists are lightweight summaries
  // (see ApiGroupSummary etc.), but still not worth fetching until a screen
  // that actually needs that resource type is visited — e.g. opening the
  // app straight into a deep-linked expense group shouldn't also fetch the
  // (unrelated) shopping-list groups tab. Each fires once per session, the
  // first time its screen family is visited.
  useEffect(() => {
    if (!currentUser || groupsListLoaded) return;
    if (!(screen === "groups" || isStandardGroupScreen)) return;
    refreshGroups(currentUser.id).then(() => setGroupsListLoaded(true)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, screen, groupsListLoaded]);

  useEffect(() => {
    if (!currentUser || wishlistsListLoaded) return;
    if (!(screen === "wishlists" || screen === "wishlist")) return;
    refreshWishlists().then(() => setWishlistsListLoaded(true)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, screen, wishlistsListLoaded]);

  useEffect(() => {
    if (!currentUser || expenseGroupsListLoaded) return;
    if (!(screen === "expenseGroups" || isExpenseGroupScreen)) return;
    refreshExpenseGroups(currentUser.id).then(() => setExpenseGroupsListLoaded(true)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, screen, expenseGroupsListLoaded]);

  // ── Full detail on enter ──
  // Real-time keeps things in sync while you're already looking at one of
  // these, but landing on it fresh (a deep link, or straight back into the
  // same one) should never show stale — or, now, still-empty-because-only-
  // the-summary-loaded — data. Fetches that one resource's full detail
  // every time you enter it, independent of the lazy tab-list fetches
  // above (a deep link into a specific group fetches its own detail
  // directly, without waiting on the groups tab's summary list at all).
  //
  // gid/xgid share the same route field (screen tells them apart), so each
  // is also gated on its own screen family — otherwise opening an expense
  // group would set gid to that same id too and fire a STANDARD group
  // detail request alongside the expense-group one (and vice versa).
  useEffect(() => {
    if (!currentUser || !gid || !isStandardGroupScreen) return;
    refreshGroupDetail(gid).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, gid, isStandardGroupScreen]);

  useEffect(() => {
    if (!currentUser || !wid) return;
    refreshWishlistDetail(wid).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, wid]);

  useEffect(() => {
    if (!currentUser || !xgid || !isExpenseGroupScreen) return;
    refreshExpenseGroupDetail(xgid).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, xgid, isExpenseGroupScreen]);

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
    // gid/xgid share the same route field (screen tells them apart) — gate
    // on the actual screen family, or opening an expense group would also
    // join this STANDARD-group room (and its handlers below would just sit
    // there matching nothing, since a real STANDARD group never shares an
    // id with an EXPENSE one, but the join/leave and unnecessary listener
    // churn is still wasted work).
    if (!currentUser || !gid || !isStandardGroupScreen) return;
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
  }, [currentUser?.id, gid, isStandardGroupScreen]);

  // Live updates for whichever expense group is currently open — mirrors the
  // shopping-list effect above, but also surfaces a toast when the change
  // came from someone else (shopping-list items don't, since every checkbox
  // toggle would get noisy; an expense being logged/removed is rarer and
  // worth flagging).
  useEffect(() => {
    if (!currentUser || !xgid || !isExpenseGroupScreen) return;
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
  }, [currentUser?.id, xgid, isExpenseGroupScreen]);

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
      await refreshExpenseGroupDetail(xgid);
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

  function openSettleUp(prefill?: SettleSuggestion) {
    if (!cxg || !currentUser) return;
    if (prefill) {
      setSuFromUserId(prefill.fromUserId);
      setSuToUserId(prefill.toUserId);
      setSuAmount(String(prefill.amount));
      setSuCurrency(prefill.currency);
    } else {
      const others = cxg.members.filter(m => m.id !== currentUser.id);
      setSuFromUserId(currentUser.id);
      setSuToUserId(others[0]?.id ?? "");
      setSuAmount("");
      setSuCurrency(cxg.defaultCurrency);
    }
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
                      groups={groups} loading={!groupsListLoaded}
                      onOpen={id => navigate(`/groups/${id}`)}
                      onOpenActiveList={(groupId, listId) => navigate(`/groups/${groupId}/list/${listId}`)}
                      onAddList={openAddList}
                      onCreate={() => setCreateOpen(true)}
                      onJoin={() => setJoinOpen(true)}
                    />
                  )}
                  {screen === "wishlists" && (
                    <WishlistsScreen
                      wishlists={wishlists} loading={!wishlistsListLoaded}
                      onOpen={id => navigate(`/wishlists/${id}`)}
                      onCreate={() => setWCreateOpen(true)}
                    />
                  )}
                  {screen === "wishlist" && !cw?.list && <ScreenLoading />}
                  {screen === "wishlist" && cw && cw.list && (
                    <ListScreen
                      group={{
                        id: cw.id, name: cw.name, emoji: cw.emoji,
                        members: [], bonusCards: [], inviteCode: "", myRole: "ADMIN",
                        defaultCurrency: "USD",
                        lists: [cw.list],
                        listCount: 1, activeListSummary: null,
                        itemCounts: { total: cw.list.items.length, done: cw.list.items.filter(i => i.completed).length },
                        detailLoaded: cw.detailLoaded,
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
                  {screen === "lists" && !cg && <ScreenLoading />}
                  {screen === "lists" && cg && (
                    <ListsScreen
                      group={cg} loading={!cg.detailLoaded}
                      onOpenList={id => navigate(`/groups/${gid}/list/${id}`)}
                      onDeleteList={(listId, name) => gid && setDeleteListTarget({ groupId: gid, listId, name })}
                      onAddList={() => gid && openAddList(gid)}
                      onSettings={() => navigate(`/groups/${gid}/settings`)}
                      onBack={back}
                      onAddBonusCard={() => gid && openAddBonusCard(gid)}
                      onDeleteBonusCard={deleteBonusCard}
                    />
                  )}
                  {screen === "list" && !currentList && <ScreenLoading />}
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
                  {(screen === "members" || screen === "invite" || screen === "settings") && !cg && <ScreenLoading />}
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
                      groups={expenseGroups} loading={!expenseGroupsListLoaded}
                      onOpen={id => navigate(`/expense-groups/${id}`)}
                      onCreate={() => setXgCreateOpen(true)}
                      onJoin={() => setXgJoinOpen(true)}
                    />
                  )}
                  {screen === "expenseGroup" && !cxg && <ScreenLoading />}
                  {screen === "expenseGroup" && cxg && (
                    <ExpenseGroupScreen
                      group={cxg} loading={!cxg.detailLoaded} onBack={back}
                      onSettings={() => navigate(`/expense-groups/${xgid}/settings`)}
                      onAddExpense={openAddExpense}
                      onEditExpense={openEditExpense}
                      onDeleteExpense={setDeleteExpenseTarget}
                      onSettleUp={openSettleUp}
                      onDeleteSettlement={setDeleteSettlementTarget}
                    />
                  )}
                  {(screen === "expenseGroupMembers" || screen === "expenseGroupInvite" || screen === "expenseGroupSettings") && !cxg && <ScreenLoading />}
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
