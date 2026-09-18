import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Pencil, Users, UserPlus, LogOut, Trash2 } from "lucide-react";
import type { GroupIdentity } from "../types";

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

export function SettingsScreen({ group, isAdmin, onBack, onEdit, onMembers, onInvite, onLeave, onDelete }: {
  group: GroupIdentity; isAdmin: boolean; onBack: () => void; onEdit: () => void; onMembers: () => void;
  onInvite: () => void; onLeave: () => void; onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted -ml-1 transition-colors">
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <h2 className="flex-1 font-bold text-lg text-foreground">{t("settings.title")}</h2>
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
              {t("settings.membersCount", { count: group.members.length })}{group.myRole === "ADMIN" ? t("settings.youAreAdmin") : ""}
            </p>
          </div>
        </div>

        {/* Group section */}
        <section>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.18em] mb-2 px-1">{t("settings.groupSection")}</p>
          <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
            <SettingsRow icon={<Pencil className="w-full h-full" />} label={t("settings.editGroup")} sub={t("settings.editGroupSub")} onClick={onEdit} />
            <SettingsRow icon={<Users className="w-full h-full" />} label={t("settings.membersLabel")} sub={t("settings.peopleCount", { count: group.members.length })} onClick={onMembers} />
            <SettingsRow icon={<UserPlus className="w-full h-full" />} label={t("settings.inviteMembers")} sub={t("settings.inviteMembersSub")} onClick={onInvite} />
          </div>
        </section>

        {/* Account */}
        <section>
          <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
            <SettingsRow icon={<LogOut className="w-full h-full" />} label={t("settings.leaveGroup")} danger onClick={onLeave} />
            {isAdmin && (
              <SettingsRow icon={<Trash2 className="w-full h-full" />} label={t("settings.deleteGroup")} danger onClick={onDelete} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
