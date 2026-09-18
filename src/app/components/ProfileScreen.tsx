import { useTranslation } from "react-i18next";
import { LogOut, Sun, Moon, Monitor, Languages, Download } from "lucide-react";
import { Avatar, type ThemeMode } from "./ui-kit";
import type { ApiUser } from "../lib/api";
import type { UpdateInfo } from "../lib/appUpdate";
import { LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from "../i18n";

export function ProfileScreen({ user, theme, onTheme, onGoLogin, onLogout, updateInfo, onDownloadUpdate }: {
  user: ApiUser; theme: ThemeMode; onTheme: (t: ThemeMode) => void;
  onGoLogin: () => void; onLogout: () => void;
  updateInfo: UpdateInfo | null; onDownloadUpdate: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isGuest = user.kind === "GUEST";

  const THEMES: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: t("profile.themeLight"), icon: <Sun className="w-4 h-4" /> },
    { value: "dark", label: t("profile.themeDark"), icon: <Moon className="w-4 h-4" /> },
    { value: "system", label: t("profile.themeSystem"), icon: <Monitor className="w-4 h-4" /> },
  ];

  function changeLanguage(code: string) {
    i18n.changeLanguage(code);
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, code); } catch { /* ignore */ }
  }

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h1 className="text-2xl font-bold text-foreground">{t("profile.title")}</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Identity card */}
        <div className="flex items-center gap-3.5 bg-card border border-border rounded-2xl p-4">
          <Avatar m={{ id: user.id, name: user.name, color: user.avatarColor }} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-foreground text-sm truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isGuest ? t("profile.guestSubtitle") : user.email}
            </p>
          </div>
        </div>

        {updateInfo && (
          <section>
            <div className="bg-primary/8 border border-primary/20 rounded-2xl overflow-hidden">
              <button
                onClick={onDownloadUpdate}
                className="w-full flex items-center gap-3.5 px-4 py-3.5 hover:bg-primary/10 transition-colors text-left"
              >
                <Download className="w-4 h-4 flex-shrink-0 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-primary">{t("profile.updateAvailable")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("profile.updateAvailableSub", { version: updateInfo.version })}</p>
                </div>
              </button>
            </div>
          </section>
        )}

        {isGuest && (
          <div className="bg-primary/8 rounded-xl px-4 py-3.5 flex items-start gap-2.5">
            <span className="text-base mt-0.5">💡</span>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("profile.guestBanner")}
              </p>
              <button onClick={onGoLogin} className="text-xs font-bold text-primary hover:underline mt-1.5">
                {t("profile.login")}
              </button>
            </div>
          </div>
        )}

        {/* Appearance */}
        <section>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.18em] mb-2 px-1">{t("profile.appearance")}</p>
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-sm font-semibold text-foreground mb-3">{t("profile.theme")}</p>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map(th => (
                <button
                  key={th.value}
                  onClick={() => onTheme(th.value)}
                  className={`flex flex-col items-center gap-2 py-3 rounded-xl border-2 transition-all ${
                    theme === th.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50 hover:border-muted-foreground/30"
                  }`}
                >
                  {th.icon}
                  <span className="text-xs font-semibold">{th.label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Language */}
        <section>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.18em] mb-2 px-1">{t("profile.language")}</p>
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="grid grid-cols-2 gap-2">
              {SUPPORTED_LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => changeLanguage(lang.code)}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all ${
                    i18n.resolvedLanguage === lang.code
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50 hover:border-muted-foreground/30"
                  }`}
                >
                  <Languages className="w-4 h-4" />
                  <span className="text-xs font-semibold">{lang.label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Account */}
        <section>
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
            >
              <LogOut className="w-4 h-4 flex-shrink-0 text-red-500 dark:text-red-400" />
              <p className="text-sm font-semibold text-red-500 dark:text-red-400">{t("profile.signOut")}</p>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
