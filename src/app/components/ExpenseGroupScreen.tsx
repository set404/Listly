import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Settings, Trash2, ArrowRightLeft, Plus } from "lucide-react";
import { Btn, Avatar, type Member } from "./ui-kit";
import { formatMoney } from "../lib/currencies";
import { computeExpenseBalances, computeSettleUpSuggestions, formatRelativeDate } from "../lib/mappers";
import type { ExpenseGroup, ExpenseVM, SettlementVM, SettleSuggestion } from "../types";

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

export function ExpenseGroupScreen({ group, onBack, onSettings, onAddExpense, onEditExpense, onDeleteExpense, onSettleUp, onDeleteSettlement }: {
  group: ExpenseGroup; onBack: () => void; onSettings: () => void;
  onAddExpense: () => void; onEditExpense: (expense: ExpenseVM) => void; onDeleteExpense: (expense: ExpenseVM) => void;
  onSettleUp: (prefill?: SettleSuggestion) => void; onDeleteSettlement: (settlement: SettlementVM) => void;
}) {
  const { t, i18n } = useTranslation();
  const balances = computeExpenseBalances(group);
  const me = group.members.find(m => m.isCurrentUser);
  const myBalances = me ? balances[me.id] ?? {} : {};
  const myEntries = Object.entries(myBalances).filter(([, amt]) => Math.abs(amt) > 0.005);
  const settleSuggestions = computeSettleUpSuggestions(group);
  const mySuggestions = me ? settleSuggestions.filter(s => s.fromUserId === me.id || s.toUserId === me.id) : [];
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
            <div className="space-y-1 pt-3 border-t border-border">
              {mySuggestions.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center">{t("expenseGroupScreen.settledUp")}</p>
              ) : (
                mySuggestions.map(s => {
                  const iOwe = me ? s.fromUserId === me.id : false;
                  const other = group.members.find(m => m.id === (iOwe ? s.toUserId : s.fromUserId));
                  if (!other) return null;
                  return (
                    <button
                      key={`${s.fromUserId}-${s.toUserId}-${s.currency}`}
                      type="button"
                      onClick={() => onSettleUp(s)}
                      className="w-full flex items-center gap-2.5 -mx-1 px-1 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <Avatar m={other} size="xs" />
                      <span className="flex-1 text-left text-xs font-medium text-foreground truncate">
                        {iOwe
                          ? t("expenseGroupScreen.youOwe", { name: other.name })
                          : t("expenseGroupScreen.owesYou", { name: other.name })}
                      </span>
                      <span className={`text-xs font-semibold tabular-nums flex-shrink-0 ${iOwe ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {formatMoney(s.amount, s.currency, i18n.language)}
                      </span>
                    </button>
                  );
                })
              )}
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
        <Btn variant="outline" full size="lg" onClick={() => onSettleUp()}>
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
