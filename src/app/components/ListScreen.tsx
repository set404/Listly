import { motion, AnimatePresence, LayoutGroup, Reorder } from "motion/react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Pencil, Share2, Trash2 } from "lucide-react";
import { Avatar } from "./ui-kit";
import { ItemRow } from "./ItemRow";
import { QuickAddRow } from "./QuickAddRow";
import { BonusCardRow } from "./BonusCardRow";
import { formatMoney } from "../lib/currencies";
import type { Group, ListSummary, ListItem } from "../types";

// ─── List screen ──────────────────────────────────────────────────────────────

export function ListScreen({
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
