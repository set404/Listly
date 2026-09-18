import { useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Check, Copy, Share2, Loader2, RefreshCw } from "lucide-react";
import { Btn } from "./ui-kit";
import type { GroupIdentity } from "../types";

// ─── Invite ───────────────────────────────────────────────────────────────────

export function InviteScreen({ group, onBack, onNewCode }: {
  group: GroupIdentity; onBack: () => void; onNewCode: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [regen, setRegen] = useState(false);

  function copy() {
    navigator.clipboard.writeText(group.inviteCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({
        title: t("invite.shareTitle", { name: group.name }),
        text: t("invite.shareText", { code: group.inviteCode }),
      }).catch(() => {});
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
        <h2 className="flex-1 font-bold text-lg text-foreground">{t("invite.title")}</h2>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-7 pb-8">
        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground">{t("invite.shareCodeIntro")}</p>
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("invite.inviteCode")}</p>
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
              {copied ? t("invite.copied") : t("invite.copyCode")}
            </Btn>
            <Btn variant="outline" full onClick={share}>
              <Share2 className="w-4 h-4" />
              {t("invite.share")}
            </Btn>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center leading-relaxed max-w-[256px]">
          {t("invite.hint")}
        </p>

        <button
          onClick={doRegen}
          disabled={regen}
          className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {regen ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {t("invite.generateNewCode")}
        </button>
      </div>
    </div>
  );
}
