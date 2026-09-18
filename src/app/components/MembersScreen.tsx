import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Trash2 } from "lucide-react";
import { Avatar, type Member } from "./ui-kit";
import type { GroupIdentity } from "../types";

// ─── Members ──────────────────────────────────────────────────────────────────

export function MembersScreen({ group, isAdmin, onBack, onRemove }: {
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
