import { useState, useEffect, useRef } from "react";
import type { TouchEvent as ReactTouchEvent, TouchList as ReactTouchList } from "react";
import { useNavigate, useLocation, useNavigationType } from "react-router";
import { motion, AnimatePresence, LayoutGroup, useMotionValue, animate } from "motion/react";
import { format } from "date-fns";
import {
  Check, Plus, Copy, Share2, RefreshCw, ChevronLeft, ChevronRight,
  Settings, Users, LogOut, UserPlus, Home, UserRound, Gift, Pencil,
  Loader2, ShoppingBag, CheckCircle2, Trash2, ImagePlus, X,
} from "lucide-react";
import { Btn, Field, Sheet, Confirm, Toast, Avatar, type Member, type ThemeMode } from "./components/ui-kit";
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
  type ApiWishlist, type ApiPublicWishlist,
  listGroups as apiListGroups,
  getGroup as apiGetGroup,
  createGroup as apiCreateGroup,
  updateGroup as apiUpdateGroup,
  joinGroup as apiJoinGroup,
  leaveGroup as apiLeaveGroup,
  removeMember as apiRemoveMember,
  regenerateInvite as apiRegenerateInvite,
  addBonusCard as apiAddBonusCard,
  deleteBonusCard as apiDeleteBonusCard,
  createList as apiCreateList,
  deleteList as apiDeleteList,
  addItem as apiAddItem,
  updateItem as apiUpdateItem,
  deleteItem as apiDeleteItem,
  logout as apiLogout,
  listWishlists as apiListWishlists,
  createWishlist as apiCreateWishlist,
  updateWishlist as apiUpdateWishlist,
  deleteWishlist as apiDeleteWishlist,
  regenerateWishlistShareLink as apiRegenerateWishlistShareLink,
  getPublicWishlist as apiGetPublicWishlist,
} from "./lib/api";
import { getSocket, connectSocket, disconnectSocket, joinGroupRoom, leaveGroupRoom } from "./lib/socket";
import { initPushNotifications } from "./lib/push";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen =
  | "login" | "register" | "groups" | "profile" | "lists" | "list" | "settings" | "members" | "invite"
  | "wishlists" | "wishlist" | "public-wishlist" | "unknown";
type TabScreen = "groups" | "wishlists" | "profile";
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
  return { screen: "unknown", ...EMPTY_ROUTE_IDS };
}

interface ListItem {
  id: string;
  clientId: string;
  text: string;
  imageUrl?: string;
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

interface Group {
  id: string;
  name: string;
  emoji: string;
  members: Member[];
  lists: ListSummary[];
  inviteCode: string;
  bonusCards: BonusCardVM[];
  myRole: GroupRole;
}

interface Wishlist {
  id: string;
  name: string;
  emoji: string;
  shareToken: string | null;
  list: ListSummary | null;
}

const EMOJIS = ["📋", "🏠", "🍱", "✈️", "🛒", "🎯", "📦", "🌿", "💼", "🎉"];
const WISHLIST_EMOJIS = ["🎁", "🎂", "💍", "🎄", "👶", "🏡", "🎓", "❤️", "✨", "🎉"];

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

// ─── API → view-model mapping ──────────────────────────────────────────────

function mapItem(i: ApiListItem): ListItem {
  return {
    id: i.id,
    clientId: i.id,
    text: i.text,
    imageUrl: i.imageUrl ?? undefined,
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
    bonusCards: g.bonusCards.map(mapBonusCard),
    myRole: g.myRole,
    members: g.members.map(m => ({
      id: m.id, name: m.name, color: m.color, isCurrentUser: m.id === currentUserId,
    })),
    lists: g.lists.map(mapList),
  };
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

function BottomNav({ active, onChange }: { active: TabScreen; onChange: (tab: TabScreen) => void }) {
  const tabs: { key: TabScreen; label: string; icon: React.ReactNode }[] = [
    { key: "groups", label: "Groups", icon: <Home className="w-5 h-5" /> },
    { key: "wishlists", label: "Wishlists", icon: <Gift className="w-5 h-5" /> },
    { key: "profile", label: "Profile", icon: <UserRound className="w-5 h-5" /> },
  ];
  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-30 bg-card/95 backdrop-blur-sm border-t border-border flex"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
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
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-background gap-5 px-8 h-full">
      <div className="w-16 h-16 rounded-[22px] bg-primary flex items-center justify-center shadow-xl shadow-primary/30">
        <ShoppingBag className="w-8 h-8 text-primary-foreground" />
      </div>
      {error ? (
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground max-w-[240px]">{error}</p>
          <Btn variant="outline" size="sm" onClick={onRetry}>Try again</Btn>
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
        className="absolute left-0 right-0 top-0 flex items-center justify-center pointer-events-none z-40"
        style={{
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

function ZoomableImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
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

function BonusCardRow({ cards, onAdd, onDelete }: {
  cards: BonusCardVM[]; onAdd: () => void; onDelete: (cardId: string) => void;
}) {
  const [viewing, setViewing] = useState<BonusCardVM | null>(null);
  const a = [
      'lilit@lilit.com',
      'tik@tik.com',
      'mama@mama.com',
      'mariam@mariam.com'
  ]

  return (
    <div className="px-4 pb-4 pt-1 flex-shrink-0">
      <div className="flex gap-2.5 overflow-x-auto">
        {cards.map(card => (
          <button
            key={card.id}
            type="button"
            onClick={() => setViewing(card)}
            className="flex-shrink-0 w-20 text-center"
          >
            <div className="w-20 h-20 rounded-2xl overflow-hidden border border-border shadow-sm">
              <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover" />
            </div>
            <p className="text-[11px] font-medium text-muted-foreground mt-1 truncate">{card.name}</p>
          </button>
        ))}
        <button
          type="button"
          onClick={onAdd}
          aria-label="Add bonus card"
          className="flex-shrink-0 w-20 h-20 rounded-2xl border-2 border-dashed border-border bg-muted/40 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <ImagePlus className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Add</span>
        </button>
      </div>

      <AnimatePresence>
        {viewing && (
          <motion.div
            key="bonus-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setViewing(null)}
            className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-6 gap-4"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              onClick={e => e.stopPropagation()}
              className="max-w-full max-h-[65vh]"
            >
              <ZoomableImage
                src={viewing.imageUrl}
                alt={viewing.name}
                className="max-w-full max-h-[65vh] rounded-2xl object-contain"
              />
            </motion.div>
            <p onClick={e => e.stopPropagation()} className="text-white font-semibold text-base text-center px-4">
              {viewing.name}
            </p>
            <div onClick={e => e.stopPropagation()} className="flex gap-3">
              <button
                onClick={() => setViewing(null)}
                type="button"
                className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => { onDelete(viewing.id); setViewing(null); }}
                type="button"
                className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
            <button
              onClick={() => setViewing(null)}
              type="button"
              aria-label="Close"
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
  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h1 className="text-2xl font-bold text-foreground">My Groups</h1>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onJoin}
            className="h-9 px-3.5 rounded-xl text-sm font-semibold text-primary hover:bg-primary/10 transition-colors flex items-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Join
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
              <p className="font-semibold text-foreground">No groups yet</p>
              <p className="text-sm text-muted-foreground">Create one or join with an invite code.</p>
            </div>
            <Btn variant="primary" onClick={onCreate} size="md">
              <Plus className="w-4 h-4" />
              Create group
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
                  className="w-full bg-card border border-border rounded-2xl p-4 flex items-center gap-3.5 hover:bg-muted/20 active:scale-[0.985] transition-all text-left shadow-sm cursor-pointer"
                >
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl flex-shrink-0">
                    {g.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm leading-snug">{g.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs">
                      <span className="text-muted-foreground">{g.lists.length} {g.lists.length === 1 ? "list" : "lists"}</span>
                      {activeCount > 0 && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="text-primary font-semibold">{activeCount} left</span>
                        </>
                      )}
                      {allDone && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">All done ✓</span>
                        </>
                      )}
                    </div>
                    <div className="flex -space-x-1.5 mt-2">
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
                  </div>
                  {activeList && (
                    <button
                      onClick={e => { e.stopPropagation(); onOpenActiveList(g.id, activeList.id); }}
                      className="h-8 px-3 rounded-lg text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/15 active:scale-95 transition-all flex-shrink-0"
                    >
                      Active list
                    </button>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); onAddList(g.id); }}
                    aria-label={`Add a list to ${g.name}`}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95 transition-all flex-shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
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

// ─── Wishlists ────────────────────────────────────────────────────────────────

function WishlistsScreen({ wishlists, onOpen, onCreate }: {
  wishlists: Wishlist[]; onOpen: (id: string) => void; onCreate: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h1 className="text-2xl font-bold text-foreground">Wishlists</h1>
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
              <p className="font-semibold text-foreground">No wishlists yet</p>
              <p className="text-sm text-muted-foreground">Create one and share it as a read-only link.</p>
            </div>
            <Btn variant="primary" onClick={onCreate} size="md">
              <Plus className="w-4 h-4" />
              Create wishlist
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
                        <span className="text-muted-foreground">No items yet</span>
                      ) : allDone ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">All done ✓</span>
                      ) : (
                        <>
                          <span className="text-primary font-semibold">{activeCount} left</span>
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

// ─── List card (used for both the featured active list and the rest) ─────────

function ListCard({ list, featured, delay = 0, onClick, onDelete }: {
  list: ListSummary; featured?: boolean; delay?: number; onClick: () => void; onDelete: () => void;
}) {
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
              <span className="text-muted-foreground">No items yet</span>
            ) : allDone ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">All done ✓</span>
            ) : (
              <>
                <span className="text-primary font-semibold">{activeCount} left</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-muted-foreground">{doneCount}/{list.items.length}</span>
              </>
            )}
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          aria-label={`Delete ${list.name}`}
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
              <p className="font-semibold text-foreground">No lists yet</p>
              <p className="text-sm text-muted-foreground">Create your first list to start adding items.</p>
            </div>
            <Btn variant="primary" onClick={onAddList} size="md">
              <Plus className="w-4 h-4" />
              Add list
            </Btn>
          </div>
        ) : (
          <>
            {active && (
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.18em] mb-2 px-1">Active list</p>
                <ListCard
                  list={active} featured onClick={() => onOpenList(active.id)}
                  onDelete={() => onDeleteList(active.id, active.name)}
                />
              </div>
            )}
            {others.length > 0 && (
              <div className="mt-6">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.18em] mb-2 px-1">All lists</p>
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
            Add list
          </Btn>
        </div>
      )}
      <BonusCardRow cards={group.bonusCards} onAdd={onAddBonusCard} onDelete={onDeleteBonusCard} />
    </div>
  );
}

// ─── List item row ────────────────────────────────────────────────────────────

function ItemRow({ item, onToggle, onEdit, onDelete, onSetImage }: {
  item: ListItem; onToggle: () => void; onEdit: (text: string) => void; onDelete: () => void;
  onSetImage: (imageUrl: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [attachingPhoto, setAttachingPhoto] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: item.completed ? 0.6 : 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex items-center gap-3.5 py-3.5 px-1 rounded-xl transition-colors ${!item.completed ? "hover:bg-muted/40" : ""}`}
    >
      <button
        onClick={onToggle}
        type="button"
        className="flex-shrink-0"
        aria-label={item.completed ? "Mark incomplete" : "Mark complete"}
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
          aria-label="View photo"
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
            aria-label="Add a photo"
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
          className="flex-1 bg-transparent text-sm leading-relaxed text-foreground focus:outline-none"
        />
      ) : (
        <span
          onClick={startEdit}
          className={`flex-1 text-sm leading-relaxed transition-all cursor-text ${item.completed ? "line-through text-muted-foreground" : "text-foreground"}`}
        >
          {item.text}
        </span>
      )}
      <button
        onClick={onDelete}
        type="button"
        aria-label={`Delete ${item.text}`}
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
              aria-label="Close"
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Quick-add row (sits right after the last checkbox) ────────────────────────

function QuickAddRow({ onAdd }: { onAdd: (text: string, imageUrl?: string) => void }) {
  const [text, setText] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function submit() {
    const t = text.trim();
    if (!t) return;
    onAdd(t, imageDataUrl ?? undefined);
    setText("");
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
        placeholder="Add item…"
        autoComplete="off"
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
      />
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
            aria-label="Remove photo"
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
          aria-label="Attach a photo"
          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
        >
          {compressing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
}

// ─── List screen ──────────────────────────────────────────────────────────────

function ListScreen({ group, list, onBack, onToggle, onEdit, onAdd, onDeleteItem, onSetImage, onAddBonusCard, onDeleteBonusCard, onShare, onRename }: {
  group: Group; list: ListSummary; onBack: () => void; onToggle: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onAdd: (text: string, imageUrl?: string) => void;
  onDeleteItem: (id: string) => void;
  onSetImage: (id: string, imageUrl: string) => void;
  onAddBonusCard?: () => void; onDeleteBonusCard?: (cardId: string) => void;
  onShare?: () => void; onRename?: () => void;
}) {
  const active = list.items.filter(i => !i.completed);
  const done = list.items.filter(i => i.completed).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const total = list.items.length;
  const doneCount = done.length;
  const allDone = total > 0 && active.length === 0;
  const pct = total === 0 ? 0 : (doneCount / total) * 100;

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
              aria-label="Edit name & icon"
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
            >
              <Pencil className="w-4 h-4 text-foreground" />
            </button>
          )}
          {onShare && (
            <button
              onClick={onShare}
              aria-label="Share"
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
            >
              <Share2 className="w-4.5 h-4.5 text-foreground" />
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
      </div>

      {/* List content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-1 pb-6">
          {total === 0 && (
            <div className="text-center pt-8 pb-2">
              <p className="text-sm text-muted-foreground">Nothing here yet — add your first item below.</p>
            </div>
          )}
          <LayoutGroup>
            <AnimatePresence initial={false}>
              {active.map(item => (
                <ItemRow
                  key={item.clientId} item={item} onToggle={() => onToggle(item.id)}
                  onEdit={t => onEdit(item.id, t)} onDelete={() => onDeleteItem(item.id)}
                  onSetImage={url => onSetImage(item.id, url)}
                />
              ))}
            </AnimatePresence>

            <QuickAddRow onAdd={onAdd} />

            <AnimatePresence initial={false}>
              {allDone && (
                <motion.div
                  key="celebrate" layout
                  initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl px-4 py-3.5 mb-1 mt-2"
                >
                  <span className="text-xl">🎉</span>
                  <div>
                    <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">All done!</p>
                    <p className="text-xs text-emerald-700/70 dark:text-emerald-400/70">Every item is checked off.</p>
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
                    Completed
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </motion.div>
              )}
              {done.map(item => (
                <ItemRow
                  key={item.clientId} item={item} onToggle={() => onToggle(item.id)}
                  onEdit={t => onEdit(item.id, t)} onDelete={() => onDeleteItem(item.id)}
                  onSetImage={url => onSetImage(item.id, url)}
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
  group: Group; isAdmin: boolean; onBack: () => void; onRemove: (m: Member) => void;
}) {
  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted -ml-1 transition-colors">
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <h2 className="flex-1 font-bold text-lg text-foreground">Members</h2>
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
              <span className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">You</span>
            )}
            {isAdmin && !m.isCurrentUser && (
              <button
                onClick={() => onRemove(m)}
                aria-label={`Remove ${m.name}`}
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
  group: Group; onBack: () => void; onNewCode: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [regen, setRegen] = useState(false);

  function copy() {
    navigator.clipboard.writeText(group.inviteCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: `Join ${group.name} on Listly`, text: `Use code ${group.inviteCode} to join.` }).catch(() => {});
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
        <h2 className="flex-1 font-bold text-lg text-foreground">Invite Members</h2>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-7 pb-8">
        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground">Share this code to invite people to</p>
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Invite Code</p>
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
              {copied ? "Copied!" : "Copy code"}
            </Btn>
            <Btn variant="outline" full onClick={share}>
              <Share2 className="w-4 h-4" />
              Share
            </Btn>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center leading-relaxed max-w-[256px]">
          Anyone in the group can invite new members with this code. Generate a new code to revoke access.
        </p>

        <button
          onClick={doRegen}
          disabled={regen}
          className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {regen ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Generate new code
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

function SettingsScreen({ group, onBack, onEdit, onMembers, onInvite, onLeave }: {
  group: Group; onBack: () => void; onEdit: () => void; onMembers: () => void; onInvite: () => void; onLeave: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted -ml-1 transition-colors">
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <h2 className="flex-1 font-bold text-lg text-foreground">Settings</h2>
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
              {group.members.length} members{group.myRole === "ADMIN" ? " · You're the admin" : ""}
            </p>
          </div>
        </div>

        {/* Group section */}
        <section>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.18em] mb-2 px-1">Group</p>
          <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
            <SettingsRow icon={<Pencil className="w-full h-full" />} label="Edit group" sub="Change the name or icon" onClick={onEdit} />
            <SettingsRow icon={<Users className="w-full h-full" />} label="Members" sub={`${group.members.length} people`} onClick={onMembers} />
            <SettingsRow icon={<UserPlus className="w-full h-full" />} label="Invite members" sub="Share a code to add others" onClick={onInvite} />
          </div>
        </section>

        {/* Account */}
        <section>
          <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
            <SettingsRow icon={<LogOut className="w-full h-full" />} label="Leave group" danger onClick={onLeave} />
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
        <p className="font-semibold text-foreground">This link isn't valid anymore</p>
        <p className="text-sm text-muted-foreground">It may have been revoked or the wishlist deleted.</p>
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
            <p className="text-sm text-muted-foreground">This wishlist is empty.</p>
          </div>
        )}
        {active.map(item => <PublicWishlistItemRow key={item.id} item={item} />)}
        {done.length > 0 && (
          <div className="flex items-center gap-3 py-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">Completed</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}
        {done.map(item => <PublicWishlistItemRow key={item.id} item={item} />)}
      </div>
      <div className="px-4 py-3 border-t border-border text-center">
        <p className="text-xs text-muted-foreground">Shared via Listly · view only</p>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
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

  function back() {
    navigate(-1);
  }

  // Capacitor's Android bridge doesn't automatically map the hardware back
  // button to in-app navigation — left unhandled, it just exits the
  // activity from any screen. Pop one route (mirroring `back()`) when
  // there's somewhere to go; only actually exit at the true root.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const subPromise = CapApp.addListener("backButton", () => {
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

  async function handlePullRefresh() {
    if (!currentUser) return;
    await Promise.all([refreshGroups(currentUser.id), refreshWishlists()])
      .catch(() => notify("Couldn't refresh — check your connection."));
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
      await Promise.all([refreshGroups(result.user.id), refreshWishlists()]);
      if (!routedInitialScreen.current) {
        enterApp(result.user);
      } else {
        setCurrentUser(result.user);
      }
      setBooting(false);
    } catch {
      setBootError("Couldn't connect to Listly. Check your connection and try again.");
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
      await Promise.all([refreshGroups(user.id), refreshWishlists()]);
      enterApp(user);
    } catch {
      notify("Couldn't start a guest session. Try again.");
    } finally {
      setGuestLoading(false);
    }
  }

  async function handleRecoveryAccept() {
    if (!recovery) return;
    setRecoveryLoading(true);
    try {
      const user = await acceptRecovery(recovery.recoveryId);
      await Promise.all([refreshGroups(user.id), refreshWishlists()]);
      setRecovery(null);
      enterApp(user);
    } catch {
      notify("Couldn't restore your session. Try again.");
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
    await Promise.all([refreshGroups(user.id), refreshWishlists()]);
    enterApp(user);
    notify(`Welcome, ${user.name.split(" ")[0]}!`);
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

  const showTabBar = screen === "groups" || screen === "wishlists" || screen === "profile";

  // ── Route guard ──
  // Keep the URL honest: bounce signed-out visitors off protected routes,
  // signed-in ones off the auth screens, and drop dead group links back home.
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
    if (gid && !cg) {
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, currentUser, screen, gid, cg, lid, currentList, wid, cw]);

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

    socket.on("list:created", onListCreated);
    socket.on("list:deleted", onListDeleted);
    socket.on("item:created", onItemCreated);
    socket.on("item:updated", onItemUpdated);
    socket.on("item:deleted", onItemDeleted);

    return () => {
      socket.off("connect", onConnect);
      document.removeEventListener("visibilitychange", onVisible);
      socket.off("list:created", onListCreated);
      socket.off("list:deleted", onListDeleted);
      socket.off("item:created", onItemCreated);
      socket.off("item:updated", onItemUpdated);
      socket.off("item:deleted", onItemDeleted);
      leaveGroupRoom(gid);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, gid]);

  // ── Overlay visibility ──
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
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
  const [creating, setCreating] = useState(false);

  async function doCreate() {
    const name = cName.trim();
    if (!name) return;
    if (!currentUser) { notify("You need a session first — try reloading."); return; }
    setCreating(true);
    try {
      const g = await apiCreateGroup(name, cEmoji);
      setGroups(gs => [...gs, mapGroup(g, currentUser.id)]);
      setCName(""); setCEmoji("📋"); setCreateOpen(false);
      notify(`"${name}" created!`);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Couldn't create the group.");
    } finally {
      setCreating(false);
    }
  }

  // ── Edit group ──
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [egName, setEgName] = useState("");
  const [egEmoji, setEgEmoji] = useState("📋");
  const [egSaving, setEgSaving] = useState(false);

  function openEditGroup() {
    if (!cg) return;
    setEgName(cg.name);
    setEgEmoji(cg.emoji);
    setEditGroupOpen(true);
  }

  async function doEditGroup() {
    const name = egName.trim();
    if (!gid || !name) return;
    setEgSaving(true);
    try {
      const g = await apiUpdateGroup(gid, { name, emoji: egEmoji });
      setGroups(gs => gs.map(x => x.id !== gid ? x : { ...x, name: g.name, emoji: g.emoji }));
      setEditGroupOpen(false);
      notify("Group updated!");
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Couldn't update the group.");
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
    if (!currentUser) { notify("You need a session first — try reloading."); return; }
    setJStatus("loading");
    try {
      const g = await apiJoinGroup(code);
      setGroups(gs => [...gs, mapGroup(g, currentUser.id)]);
      setJStatus("success");
      setTimeout(() => {
        setJoinOpen(false); resetJoin();
        notify(`Joined "${g.name}"!`);
      }, 1200);
    } catch (e) {
      setJStatus("error");
      setJErr(e instanceof ApiError ? e.message : "Invalid code. Double-check and try again.");
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
      notify(`"${name}" created!`);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Couldn't create the wishlist.");
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
      notify("New link generated — the old one no longer works.");
    } catch {
      notify("Couldn't generate a new link.");
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
      notify("Wishlist updated!");
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Couldn't update the wishlist.");
    } finally {
      setWeSaving(false);
    }
  }

  async function doDeleteWishlist() {
    if (!wid) return;
    try {
      await apiDeleteWishlist(wid);
      setWishlists(ws => ws.filter(w => w.id !== wid));
      notify("Wishlist deleted.");
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Couldn't delete the wishlist.");
    } finally {
      setWDeleteOpen(false);
      navigate("/wishlists", { replace: true });
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
    setNewListName(`List ${format(new Date(), "MMM d")}`);
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
      notify(`"${name}" created!`);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Couldn't create the list.");
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
      notify(`"${name}" deleted.`);
      if (lid === listId) navigate(`/groups/${groupId}`, { replace: true });
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Couldn't delete the list.");
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
      notify("Couldn't process that photo.");
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
      notify(`"${name}" added!`);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Couldn't add that bonus card.");
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
      notify("Couldn't delete that bonus card.");
    });
  }

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
      notify("Couldn't update that item.");
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
      notify("Couldn't update that item.");
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
      notify("Couldn't add that photo.");
    });
  }

  function addItem(text: string, imageUrl?: string) {
    if (!gid || !lid) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticItem: ListItem = { id: tempId, clientId: tempId, text, imageUrl, completed: false };

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

    apiAddItem(lid, text, imageUrl)
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
        notify("Couldn't add that item.");
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
      notify("Couldn't delete that item.");
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
      notify("Couldn't update that item.");
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
      notify("Couldn't update that item.");
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
      notify("Couldn't add that photo.");
    });
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
        notify("Couldn't add that item.");
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
      notify("Couldn't delete that item.");
    });
  }

  async function regenCode() {
    if (!gid) return;
    try {
      const { inviteCode } = await apiRegenerateInvite(gid);
      setGroups(gs => gs.map(g => g.id !== gid ? g : { ...g, inviteCode }));
      notify("New code generated!");
    } catch {
      notify("Couldn't generate a new code.");
    }
  }

  async function confirmRemoveMember() {
    if (!gid || !removeTarget) return;
    const target = removeTarget;
    try {
      await apiRemoveMember(gid, target.id);
      setGroups(gs => gs.map(g => g.id !== gid ? g : { ...g, members: g.members.filter(m => m.id !== target.id) }));
      notify(`Removed ${target.name}.`);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Couldn't remove that member.");
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
      notify("Left the group.");
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Couldn't leave the group.");
    } finally {
      setLeaveOpen(false);
      navigate("/groups", { replace: true });
    }
  }

  async function logout() {
    setLogoutOpen(false);
    await apiLogout().catch(() => {});
    setCurrentUser(null);
    setGroups([]);
    setWishlists([]);
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
          style={{ width: "100%", height: "100%" }}
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
                  style={{ borderRadius: "inherit", paddingBottom: showTabBar ? NAV_HEIGHT : 0 }}
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
                        lists: [cw.list],
                      }}
                      list={cw.list} onBack={back}
                      onToggle={toggleWishlistItem} onEdit={editWishlistItemText}
                      onAdd={addWishlistItem} onDeleteItem={deleteWishlistItemFn}
                      onSetImage={setWishlistItemImage}
                      onShare={() => setWShareOpen(true)}
                      onRename={openEditWishlist}
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
                      group={cg} onBack={back}
                      onEdit={() => openEditGroup()}
                      onMembers={() => navigate(`/groups/${gid}/members`)} onInvite={() => navigate(`/groups/${gid}/invite`)}
                      onLeave={() => setLeaveOpen(true)}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
              </PullToRefresh>

              {showTabBar && (
                <BottomNav
                  active={screen === "profile" ? "profile" : screen === "wishlists" ? "wishlists" : "groups"}
                  onChange={tab => navigate(`/${tab}`)}
                />
              )}

              {/* ── Overlays — absolute, contained in phone frame ── */}

              <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="Create a group">
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-3">Choose an icon</p>
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
                    label="Group name"
                    placeholder="e.g. Chen Family, Work Lunches…"
                    value={cName}
                    onChange={e => setCName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && doCreate()}
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <Btn variant="outline" full onClick={() => setCreateOpen(false)}>Cancel</Btn>
                    <Btn variant="primary" full onClick={doCreate} loading={creating} disabled={!cName.trim()}>Create group</Btn>
                  </div>
                </div>
              </Sheet>

              <Sheet open={editGroupOpen} onClose={() => setEditGroupOpen(false)} title="Edit group">
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-3">Choose an icon</p>
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
                    label="Group name"
                    placeholder="e.g. Chen Family, Work Lunches…"
                    value={egName}
                    onChange={e => setEgName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && doEditGroup()}
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <Btn variant="outline" full onClick={() => setEditGroupOpen(false)}>Cancel</Btn>
                    <Btn variant="primary" full onClick={doEditGroup} loading={egSaving} disabled={!egName.trim()}>Save</Btn>
                  </div>
                </div>
              </Sheet>

              <Sheet open={joinOpen} onClose={() => { setJoinOpen(false); resetJoin(); }} title="Join a group">
                <div className="space-y-5">
                  {jStatus !== "success" ? (
                    <>
                      <Field
                        label="Invite code"
                        placeholder="e.g. AB7-K92"
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
                          Ask a member to share their invite code from Settings → Invite.
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <Btn variant="outline" full onClick={() => { setJoinOpen(false); resetJoin(); }}>Cancel</Btn>
                        <Btn variant="primary" full onClick={doJoin} loading={jStatus === "loading"} disabled={!jCode.trim()}>
                          Join group
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
                        <p className="font-bold text-foreground text-lg">Joined!</p>
                        <p className="text-sm text-muted-foreground mt-1">You&apos;ve been added to the group.</p>
                      </div>
                    </motion.div>
                  )}
                </div>
              </Sheet>

              <Sheet open={wCreateOpen} onClose={() => setWCreateOpen(false)} title="Create a wishlist">
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-3">Choose an icon</p>
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
                    label="Wishlist name"
                    placeholder="e.g. Birthday, Baby shower…"
                    value={wName}
                    onChange={e => setWName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && doCreateWishlist()}
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <Btn variant="outline" full onClick={() => setWCreateOpen(false)}>Cancel</Btn>
                    <Btn variant="primary" full onClick={doCreateWishlist} loading={wCreating} disabled={!wName.trim()}>Create wishlist</Btn>
                  </div>
                </div>
              </Sheet>

              <Sheet open={wEditOpen} onClose={() => setWEditOpen(false)} title="Edit wishlist">
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-3">Choose an icon</p>
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
                    label="Wishlist name"
                    placeholder="e.g. Birthday, Baby shower…"
                    value={weName}
                    onChange={e => setWeName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && doEditWishlist()}
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <Btn variant="outline" full onClick={() => setWEditOpen(false)}>Cancel</Btn>
                    <Btn variant="primary" full onClick={doEditWishlist} loading={weSaving} disabled={!weName.trim()}>Save</Btn>
                  </div>
                </div>
              </Sheet>

              <Sheet open={wShareOpen} onClose={() => setWShareOpen(false)} title="Share wishlist">
                <div className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    Anyone with this link can view the wishlist — they can&apos;t add, check off, or change anything.
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
                        notify("Link copied!");
                      }}
                    >
                      <Copy className="w-4 h-4" />
                      Copy
                    </Btn>
                    <Btn
                      variant="primary" full
                      onClick={() => {
                        if (!cw?.shareToken) return;
                        const url = getWishlistShareUrl(cw.shareToken);
                        if (typeof navigator !== "undefined" && navigator.share) {
                          navigator.share({ title: `${cw.name} — a Listly wishlist`, url }).catch(() => {});
                        } else {
                          navigator.clipboard.writeText(url).catch(() => {});
                          notify("Link copied!");
                        }
                      }}
                    >
                      <Share2 className="w-4 h-4" />
                      Share
                    </Btn>
                  </div>
                  <button
                    onClick={() => setWRegenConfirmOpen(true)}
                    disabled={wRegenerating}
                    className="w-full flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {wRegenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Generate a new link
                  </button>
                  <button
                    onClick={() => { setWShareOpen(false); setWDeleteOpen(true); }}
                    className="w-full flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold text-red-500 dark:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete wishlist
                  </button>
                </div>
              </Sheet>

              <Sheet open={addListOpen} onClose={() => setAddListOpen(false)} title="Add a list">
                <div className="space-y-5">
                  <Field
                    label="List name"
                    placeholder="e.g. Groceries, Packing list…"
                    value={newListName}
                    onChange={e => setNewListName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && doCreateList()}
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <Btn variant="outline" full onClick={() => setAddListOpen(false)}>Cancel</Btn>
                    <Btn variant="primary" full onClick={doCreateList} loading={creatingList} disabled={!newListName.trim()}>
                      Create list
                    </Btn>
                  </div>
                </div>
              </Sheet>

              <Sheet open={addBonusCardOpen} onClose={() => setAddBonusCardOpen(false)} title="Add a bonus card">
                <div className="space-y-5">
                  <Field
                    label="Name"
                    placeholder="e.g. Loyalty card, Coupon…"
                    value={newBonusCardName}
                    onChange={e => setNewBonusCardName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && doAddBonusCard()}
                    autoFocus
                  />
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-3">Image</p>
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
                          <span className="text-xs font-semibold text-white">Tap to change</span>
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
                        <span className="text-xs font-semibold">{compressingBonusImage ? "Processing…" : "Choose a photo"}</span>
                      </button>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <Btn variant="outline" full onClick={() => setAddBonusCardOpen(false)}>Cancel</Btn>
                    <Btn
                      variant="primary" full onClick={doAddBonusCard} loading={savingBonusCard}
                      disabled={!newBonusCardName.trim() || !newBonusCardImage}
                    >
                      Add card
                    </Btn>
                  </div>
                </div>
              </Sheet>

              <Confirm
                open={leaveOpen} onClose={() => setLeaveOpen(false)}
                title="Leave group?"
                body={`You'll lose access to "${cg?.name}". You can rejoin anytime with an invite code from another member.`}
                cta="Leave group" danger onConfirm={leaveGroup}
              />

              <Confirm
                open={!!removeTarget} onClose={() => setRemoveTarget(null)}
                title="Remove member?"
                body={`${removeTarget?.name} will lose access to "${cg?.name}" and its shared list.`}
                cta="Remove" danger onConfirm={confirmRemoveMember}
              />

              <Confirm
                open={!!deleteListTarget} onClose={() => setDeleteListTarget(null)}
                title="Delete list?"
                body={`"${deleteListTarget?.name}" and all of its items will be permanently deleted.`}
                cta="Delete list" danger onConfirm={confirmDeleteList}
              />

              <Confirm
                open={wRegenConfirmOpen} onClose={() => setWRegenConfirmOpen(false)}
                title="Generate a new link?"
                body="The old share link will stop working immediately — anyone who still has it will lose access."
                cta="Generate new link" danger onConfirm={doRegenerateWishlistLink}
              />

              <Confirm
                open={wDeleteOpen} onClose={() => setWDeleteOpen(false)}
                title="Delete wishlist?"
                body={`"${cw?.name}" and all of its items will be permanently deleted. Anyone with the share link will lose access.`}
                cta="Delete wishlist" danger onConfirm={doDeleteWishlist}
              />

              <Confirm
                open={logoutOpen} onClose={() => setLogoutOpen(false)}
                title="Sign out?"
                body="You'll be returned to the login screen. Registered accounts can log back in anytime, or continue as a guest again."
                cta="Sign out" onConfirm={logout}
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
