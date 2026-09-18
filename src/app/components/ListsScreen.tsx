import { useTranslation } from "react-i18next";
import { ChevronLeft, Settings, Plus, Loader2 } from "lucide-react";
import { Btn, Avatar } from "./ui-kit";
import { ListCard } from "./ListCard";
import { BonusCardRow } from "./BonusCardRow";
import type { Group } from "../types";

// ─── Lists overview (a group's home screen) ────────────────────────────────────

export function ListsScreen({ group, loading, onOpenList, onDeleteList, onAddList, onSettings, onBack, onAddBonusCard, onDeleteBonusCard }: {
  group: Group; loading?: boolean; onOpenList: (listId: string) => void; onDeleteList: (listId: string, name: string) => void;
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
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        ) : lists.length === 0 ? (
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

      {!loading && lists.length > 0 && (
        <div className="px-5 pb-8 pt-3 border-t border-border/50 bg-background">
          <Btn variant="primary" full size="lg" onClick={onAddList}>
            <Plus className="w-5 h-5" />
            {t("listsScreen.addList")}
          </Btn>
        </div>
      )}
      {!loading && <BonusCardRow cards={group.bonusCards} onAdd={onAddBonusCard} onDelete={onDeleteBonusCard} />}
    </div>
  );
}
