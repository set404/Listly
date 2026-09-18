import { useTranslation } from "react-i18next";
import { Home, Wallet, Gift, UserRound } from "lucide-react";
import { SAFE_AREA_BOTTOM } from "./ui-kit";
import type { TabScreen } from "../lib/routing";

export function BottomNav({ active, onChange }: { active: TabScreen; onChange: (tab: TabScreen) => void }) {
  const { t } = useTranslation();
  const tabs: { key: TabScreen; label: string; icon: React.ReactNode }[] = [
    { key: "groups", label: t("nav.groups"), icon: <Home className="w-5 h-5" /> },
    { key: "expenseGroups", label: t("nav.expenses"), icon: <Wallet className="w-5 h-5" /> },
    { key: "wishlists", label: t("nav.wishlists"), icon: <Gift className="w-5 h-5" /> },
    { key: "profile", label: t("nav.profile"), icon: <UserRound className="w-5 h-5" /> },
  ];
  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-30 bg-card/95 backdrop-blur-sm border-t border-border flex"
      style={{ paddingBottom: SAFE_AREA_BOTTOM }}
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
