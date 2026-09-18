import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { UserPlus, Plus, Users, ChevronRight } from "lucide-react";
import { Btn, Avatar } from "./ui-kit";
import type { Group } from "../types";

// ─── Groups ───────────────────────────────────────────────────────────────────

export function Groups({ groups, onOpen, onOpenActiveList, onAddList, onCreate, onJoin }: {
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
              const allDone = g.itemCounts.total > 0 && g.itemCounts.done === g.itemCounts.total;
              const activeList = g.activeListSummary;
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
                        <span className="text-muted-foreground">{t("groups.listCount", { count: g.listCount })}</span>
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
