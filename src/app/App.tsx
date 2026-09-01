import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useNavigationType } from "react-router";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import { format } from "date-fns";
import {
  Check, Plus, Copy, Share2, RefreshCw, ChevronLeft, ChevronRight,
  Settings, Users, LogOut, UserPlus, Home, UserRound,
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
  ApiError, type ApiUser, type ApiGroup, type ApiList, type ApiListItem, type GroupRole,
  listGroups as apiListGroups,
  createGroup as apiCreateGroup,
  joinGroup as apiJoinGroup,
  leaveGroup as apiLeaveGroup,
  removeMember as apiRemoveMember,
  regenerateInvite as apiRegenerateInvite,
  setGroupBonusImage as apiSetGroupBonusImage,
  createList as apiCreateList,
  deleteList as apiDeleteList,
  addItem as apiAddItem,
  updateItem as apiUpdateItem,
  deleteItem as apiDeleteItem,
  logout as apiLogout,
} from "./lib/api";
import { getSocket, connectSocket, disconnectSocket, joinGroupRoom, leaveGroupRoom } from "./lib/socket";

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen = "login" | "register" | "groups" | "profile" | "lists" | "list" | "settings" | "members" | "invite" | "unknown";
type TabScreen = "groups" | "profile";
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
}

function parseRoute(pathname: string): RouteMatch {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "login") return { screen: "login", groupId: null, listId: null };
  if (parts[0] === "register") return { screen: "register", groupId: null, listId: null };
  if (parts[0] === "profile") return { screen: "profile", groupId: null, listId: null };
  if (parts[0] === "groups") {
    if (!parts[1]) return { screen: "groups", groupId: null, listId: null };
    const groupId = parts[1];
    const sub = parts[2];
    if (!sub) return { screen: "lists", groupId, listId: null };
    if (sub === "list" && parts[3]) return { screen: "list", groupId, listId: parts[3] };
    if (sub === "settings") return { screen: "settings", groupId, listId: null };
    if (sub === "members") return { screen: "members", groupId, listId: null };
    if (sub === "invite") return { screen: "invite", groupId, listId: null };
  }
  return { screen: "unknown", groupId: null, listId: null };
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

interface Group {
  id: string;
  name: string;
  emoji: string;
  members: Member[];
  lists: ListSummary[];
  inviteCode: string;
  bonusImageUrl?: string;
  myRole: GroupRole;
}

const EMOJIS = ["📋", "🏠", "🍱", "✈️", "🛒", "🎯", "📦", "🌿", "💼", "🎉"];

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

function mapGroup(g: ApiGroup, currentUserId: string): Group {
  return {
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    inviteCode: g.inviteCode,
    bonusImageUrl: g.bonusImageUrl ?? undefined,
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

// ─── Bonus card ───────────────────────────────────────────────────────────────
//
// A group-owned image slot pinned to the bottom of the group's own page and
// every one of its list pages. Any member can attach or replace it; it's
// stored on the group and shows up everywhere that group's data is shown.

function BonusCard({ imageUrl, onUpload }: { imageUrl?: string; onUpload: (dataUrl: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setUploading(true);
    try {
      onUpload(await compressImageToDataUrl(file));
    } catch {
      // Best-effort — leave the existing bonus card (or empty state) in place on failure.
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="px-4 pb-4 pt-1 flex-shrink-0">
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        aria-label={imageUrl ? "Change bonus card image" : "Add bonus card image"}
        className={`relative w-full h-20 rounded-2xl overflow-hidden shadow-sm block text-left transition-opacity disabled:opacity-70 ${
          imageUrl ? "border border-border" : "border-2 border-dashed border-border bg-muted/40"
        }`}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="Bonus card" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImagePlus className="w-5 h-5" />
            <span className="text-xs font-semibold">Add bonus card</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          </div>
        )}
        {imageUrl && !uploading && (
          <div className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
            <ImagePlus className="w-3 h-3 text-white" />
          </div>
        )}
      </button>
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

function ListsScreen({ group, onOpenList, onDeleteList, onAddList, onSettings, onBack, onSetBonusImage }: {
  group: Group; onOpenList: (listId: string) => void; onDeleteList: (listId: string, name: string) => void;
  onAddList: () => void; onSettings: () => void; onBack: () => void;
  onSetBonusImage: (imageUrl: string) => void;
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
      <BonusCard imageUrl={group.bonusImageUrl} onUpload={onSetBonusImage} />
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
            capture="environment"
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
            <motion.img
              src={item.imageUrl}
              alt=""
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              onClick={e => e.stopPropagation()}
              className="max-w-full max-h-full rounded-2xl object-contain"
            />
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
        capture="environment"
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

function ListScreen({ group, list, onBack, onToggle, onEdit, onAdd, onDeleteItem, onSetImage, onSetBonusImage }: {
  group: Group; list: ListSummary; onBack: () => void; onToggle: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onAdd: (text: string, imageUrl?: string) => void;
  onDeleteItem: (id: string) => void;
  onSetImage: (id: string, imageUrl: string) => void;
  onSetBonusImage: (imageUrl: string) => void;
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
      <BonusCard imageUrl={group.bonusImageUrl} onUpload={onSetBonusImage} />
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

function SettingsScreen({ group, onBack, onMembers, onInvite, onLeave }: {
  group: Group; onBack: () => void; onMembers: () => void; onInvite: () => void; onLeave: () => void;
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
  const routedInitialScreen = useRef(false);

  async function refreshGroups(userId: string) {
    const list = await apiListGroups();
    setGroups(list.map(g => mapGroup(g, userId)));
    return list.length;
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
      await refreshGroups(result.user.id);
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
      await refreshGroups(user.id);
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
      await refreshGroups(user.id);
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
    await refreshGroups(user.id);
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
  const showTabBar = screen === "groups" || screen === "profile";

  // ── Route guard ──
  // Keep the URL honest: bounce signed-out visitors off protected routes,
  // signed-in ones off the auth screens, and drop dead group links back home.
  useEffect(() => {
    if (booting) return;
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, currentUser, screen, gid, cg, lid, currentList]);

  // ── Realtime ──
  // One socket per session; connected whenever there's an active session and
  // scoped to whichever group is currently open by joining/leaving its room.
  useEffect(() => {
    if (currentUser) connectSocket();
    else disconnectSocket();
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser || !gid) return;
    const socket = getSocket();

    joinGroupRoom(gid);

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
      setGroups(gs => gs.map(g => g.id !== targetGroupId ? g : { ...g, lists: [...g.lists, mapList(l)] }));
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

    setGroups(gs => gs.map(g => g.id !== gid ? g : {
      ...g, lists: g.lists.map(l => l.id !== lid ? l : { ...l, items: [...l.items, optimisticItem] }),
    }));

    apiAddItem(lid, text, imageUrl)
      .then(item => {
        setGroups(gs => gs.map(g => g.id !== gid ? g : {
          ...g,
          lists: g.lists.map(l => l.id !== lid ? l : {
            // keep clientId stable (= tempId) so the row doesn't remount and replay its enter animation
            ...l, items: l.items.map(i => i.id === tempId ? { ...mapItem(item), clientId: tempId } : i),
          }),
        }));
      })
      .catch(() => {
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

  function setBonusImage(imageUrl: string) {
    if (!gid) return;
    const prevImage = cg?.bonusImageUrl;

    setGroups(gs => gs.map(g => g.id !== gid ? g : { ...g, bonusImageUrl: imageUrl }));

    apiSetGroupBonusImage(gid, imageUrl).catch(() => {
      setGroups(gs => gs.map(g => g.id !== gid ? g : { ...g, bonusImageUrl: prevImage }));
      notify("Couldn't save the bonus card.");
    });
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
          {booting ? (
            <BootSplash error={bootError} onRetry={runBootstrap} />
          ) : (
            <>
              {/* Screen layer */}
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
                      onSetBonusImage={setBonusImage}
                    />
                  )}
                  {screen === "list" && cg && currentList && (
                    <ListScreen
                      group={cg} list={currentList} onBack={back}
                      onToggle={toggleItem} onEdit={editItemText} onAdd={addItem} onDeleteItem={deleteItemFn}
                      onSetImage={setItemImage}
                      onSetBonusImage={setBonusImage}
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
                      onMembers={() => navigate(`/groups/${gid}/members`)} onInvite={() => navigate(`/groups/${gid}/invite`)}
                      onLeave={() => setLeaveOpen(true)}
                    />
                  )}
                </motion.div>
              </AnimatePresence>

              {showTabBar && (
                <BottomNav
                  active={screen === "profile" ? "profile" : "groups"}
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
