import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { UserPlus, Plus, Wallet, ChevronRight, Loader2 } from "lucide-react";
import { Btn } from "./ui-kit";
import { formatMoney } from "../lib/currencies";
import type { ExpenseGroup } from "../types";

export function ExpenseGroupsScreen({ groups, loading, onOpen, onCreate, onJoin }: {
  groups: ExpenseGroup[]; loading?: boolean; onOpen: (id: string) => void; onCreate: () => void; onJoin: () => void;
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
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        ) : groups.length === 0 ? (
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
              const summary = g.balanceSummary;
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
                            ? t("expenseGroups.youAreOwed", { amount: formatMoney(summary.amount, summary.currency, i18n.language) })
                            : t("expenseGroups.youOwe", { amount: formatMoney(summary.amount, summary.currency, i18n.language) })}
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
