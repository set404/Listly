import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import { format } from "date-fns";
import {
  Check, Plus, Copy, Share2, RefreshCw, ChevronLeft, ChevronRight,
  Settings, Users, LogOut, UserPlus, Home, UserRound,
  Loader2, ShoppingBag, CheckCircle2, Trash2,
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
  createList as apiCreateList,
  addItem as apiAddItem,
  toggleItem as apiToggleItem,
  logout as apiLogout,
} from "./lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen = "login" | "register" | "groups" | "profile" | "lists" | "list" | "settings" | "members" | "invite";
type TabScreen = "groups" | "profile";
type JoinStatus = "idle" | "loading" | "success" | "error";

interface ListItem {
  id: string;
  text: string;
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
  myRole: GroupRole;
}

const EMOJIS = ["📋", "🏠", "🍱", "✈️", "🛒", "🎯", "📦", "🌿", "💼", "🎉"];

// ─── API → view-model mapping ──────────────────────────────────────────────

function mapItem(i: ApiListItem): ListItem {
  return {
    id: i.id,
    text: i.text,
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
    myRole: g.myRole,
    members: g.members.map(m => ({
      id: m.id, name: m.name, color: m.color, isCurrentUser: m.id === currentUserId,
    })),
    lists: g.lists.map(mapList),
  };
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
    <div className="flex-1 flex flex-col items-center justify-center bg-background gap-5 px-8">
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

// ─── Groups ───────────────────────────────────────────────────────────────────

function Groups({ groups, onOpen, onCreate, onJoin }: {
  groups: Group[]; onOpen: (id: string) => void; onCreate: () => void; onJoin: () => void;
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
              return (
                <motion.button
                  key={g.id}
                  layout
                  onClick={() => onOpen(g.id)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.22 }}
                  className="w-full bg-card border border-border rounded-2xl p-4 flex items-center gap-3.5 hover:bg-muted/20 active:scale-[0.985] transition-all text-left shadow-sm"
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
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── List card (used for both the featured active list and the rest) ─────────

function ListCard({ list, featured, delay = 0, onClick }: {
  list: ListSummary; featured?: boolean; delay?: number; onClick: () => void;
}) {
  const activeCount = list.items.filter(i => !i.completed).length;
  const doneCount = list.items.length - activeCount;
  const allDone = list.items.length > 0 && activeCount === 0;
  const pct = list.items.length === 0 ? 0 : (doneCount / list.items.length) * 100;

  return (
    <motion.button
      layout
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.22 }}
      className={`w-full text-left rounded-2xl p-4 transition-all active:scale-[0.985] ${
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
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </div>
      {list.items.length > 0 && (
        <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-3">
          <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      )}
    </motion.button>
  );
}

// ─── Lists overview (a group's home screen) ────────────────────────────────────

function ListsScreen({ group, onOpenList, onAddList, onSettings, onBack }: {
  group: Group; onOpenList: (listId: string) => void; onAddList: () => void;
  onSettings: () => void; onBack: () => void;
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
                <ListCard list={active} featured onClick={() => onOpenList(active.id)} />
              </div>
            )}
            {others.length > 0 && (
              <div className="mt-6">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.18em] mb-2 px-1">All lists</p>
                <div className="space-y-3">
                  {others.map((l, i) => (
                    <ListCard key={l.id} list={l} delay={i * 0.05} onClick={() => onOpenList(l.id)} />
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
    </div>
  );
}

// ─── List item row ────────────────────────────────────────────────────────────

function ItemRow({ item, onToggle }: { item: ListItem; onToggle: () => void }) {
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
      <span className={`flex-1 text-sm leading-relaxed transition-all ${item.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
        {item.text}
      </span>
    </motion.div>
  );
}

// ─── Quick-add row (sits right after the last checkbox) ────────────────────────

function QuickAddRow({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    const t = text.trim();
    if (!t) return;
    onAdd(t);
    setText("");
    // Stay focused so pressing Enter repeatedly keeps adding items.
    requestAnimationFrame(() => inputRef.current?.focus());
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
    </div>
  );
}

// ─── List screen ──────────────────────────────────────────────────────────────

function ListScreen({ group, list, onBack, onToggle, onAdd }: {
  group: Group; list: ListSummary; onBack: () => void; onToggle: (id: string) => void;
  onAdd: (text: string) => void;
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
                <ItemRow key={item.id} item={item} onToggle={() => onToggle(item.id)} />
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
                <ItemRow key={item.id} item={item} onToggle={() => onToggle(item.id)} />
              ))}
            </AnimatePresence>
          </LayoutGroup>
        </div>
      </div>
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
  const [screen, setScreen] = useState<Screen>("login");
  const [hist, setHist] = useState<Screen[]>([]);
  const [dir, setDir] = useState(1);

  function go(s: Screen) {
    setDir(1);
    setHist(h => [...h, screen]);
    setScreen(s);
  }
  function back() {
    if (!hist.length) return;
    setDir(-1);
    setScreen(hist[hist.length - 1]);
    setHist(h => h.slice(0, -1));
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
    setDir(1); setHist([]);
    setScreen("groups");
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
          setScreen("login");
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
      setDir(1); setHist([]); setScreen("login");
    }
  }

  async function handleAuthSuccess(user: ApiUser) {
    await refreshGroups(user.id);
    enterApp(user);
    notify(`Welcome, ${user.name.split(" ")[0]}!`);
  }

  // ── Groups state ──
  const [groups, setGroups] = useState<Group[]>([]);
  const [gid, setGid] = useState<string | null>(null);
  const [lid, setLid] = useState<string | null>(null);
  const cg = groups.find(g => g.id === gid) ?? null;
  const currentList = cg?.lists.find(l => l.id === lid) ?? null;
  const isAdmin = cg?.myRole === "ADMIN";
  const showTabBar = screen === "groups" || screen === "profile";

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
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);

  function openAddList() {
    setNewListName(`List ${format(new Date(), "MMM d")}`);
    setAddListOpen(true);
  }

  async function doCreateList() {
    const name = newListName.trim();
    if (!gid || !name) return;
    setCreatingList(true);
    try {
      const l = await apiCreateList(gid, name);
      setGroups(gs => gs.map(g => g.id !== gid ? g : { ...g, lists: [...g.lists, mapList(l)] }));
      setAddListOpen(false);
      notify(`"${name}" created!`);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Couldn't create the list.");
    } finally {
      setCreatingList(false);
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

    apiToggleItem(lid, id, nextCompleted).catch(() => {
      setGroups(gs => gs.map(g => g.id !== gid ? g : {
        ...g,
        lists: g.lists.map(l => l.id !== lid ? l : { ...l, items: l.items.map(i => i.id !== id ? i : prevItem) }),
      }));
      notify("Couldn't update that item.");
    });
  }

  async function addItem(text: string) {
    if (!gid || !lid) return;
    try {
      const item = await apiAddItem(lid, text);
      setGroups(gs => gs.map(g => g.id !== gid ? g : {
        ...g, lists: g.lists.map(l => l.id !== lid ? l : { ...l, items: [...l.items, mapItem(item)] }),
      }));
    } catch {
      notify("Couldn't add that item.");
    }
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
      setLeaveOpen(false); setGid(null); setLid(null); setDir(-1); setHist([]); setScreen("groups");
    }
  }

  async function logout() {
    setLogoutOpen(false);
    await apiLogout().catch(() => {});
    setCurrentUser(null);
    setGroups([]);
    setGid(null);
    setDir(-1); setHist([]); setScreen("login");
    routedInitialScreen.current = false;
    runBootstrap();
  }

  // ── Render ──
  return (
    <div className={dark ? "dark" : ""} style={{ width: "100%", height: "100%" }}>
      {/* Outer stage — dark bg shows the phone frame */}
      <div className="w-full h-full bg-zinc-950 flex items-center justify-center">
        {/* Phone frame — position:relative so absolute overlays stay inside */}
        <div
          className="relative bg-background overflow-hidden"
          style={{
            width: "min(390px, 100%)",
            height: "min(844px, 100%)",
            borderRadius: "min(44px, 8%)",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 40px 100px rgba(0,0,0,0.6)",
          }}
        >
          {booting ? (
            <BootSplash error={bootError} onRetry={runBootstrap} />
          ) : (
            <>
              {/* Screen layer */}
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={screen}
                  className="absolute inset-0 flex flex-col overflow-hidden"
                  style={{ borderRadius: "inherit", paddingBottom: showTabBar ? NAV_HEIGHT : 0 }}
                  initial={{ opacity: 0, x: dir * 36 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: dir * -36 }}
                  transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  {screen === "login" && (
                    <LoginScreen
                      showBack={hist.length > 0}
                      onBack={back}
                      onSuccess={handleAuthSuccess}
                      onGoRegister={() => go("register")}
                      onContinueAsGuest={handleContinueAsGuest}
                      guestLoading={guestLoading}
                    />
                  )}
                  {screen === "register" && (
                    <RegisterScreen
                      onBack={back}
                      onSuccess={handleAuthSuccess}
                      onGoLogin={() => go("login")}
                    />
                  )}
                  {screen === "groups" && (
                    <Groups
                      groups={groups}
                      onOpen={id => { setGid(id); setLid(null); go("lists"); }}
                      onCreate={() => setCreateOpen(true)}
                      onJoin={() => setJoinOpen(true)}
                    />
                  )}
                  {screen === "profile" && currentUser && (
                    <ProfileScreen
                      user={currentUser} theme={themeMode} onTheme={setThemeMode}
                      onGoLogin={() => go("login")} onLogout={() => setLogoutOpen(true)}
                    />
                  )}
                  {screen === "lists" && cg && (
                    <ListsScreen
                      group={cg}
                      onOpenList={id => { setLid(id); go("list"); }}
                      onAddList={openAddList}
                      onSettings={() => go("settings")}
                      onBack={back}
                    />
                  )}
                  {screen === "list" && cg && currentList && (
                    <ListScreen
                      group={cg} list={currentList} onBack={back}
                      onToggle={toggleItem} onAdd={addItem}
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
                      onMembers={() => go("members")} onInvite={() => go("invite")}
                      onLeave={() => setLeaveOpen(true)}
                    />
                  )}
                </motion.div>
              </AnimatePresence>

              {showTabBar && (
                <BottomNav
                  active={screen === "profile" ? "profile" : "groups"}
                  onChange={tab => { setDir(1); setHist([]); setScreen(tab); }}
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
