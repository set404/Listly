import { LogOut, Sun, Moon, Monitor } from "lucide-react";
import { Avatar, type ThemeMode } from "./ui-kit";
import type { ApiUser } from "../lib/api";

const THEMES: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun className="w-4 h-4" /> },
  { value: "dark", label: "Dark", icon: <Moon className="w-4 h-4" /> },
  { value: "system", label: "System", icon: <Monitor className="w-4 h-4" /> },
];

export function ProfileScreen({ user, theme, onTheme, onGoLogin, onLogout }: {
  user: ApiUser; theme: ThemeMode; onTheme: (t: ThemeMode) => void;
  onGoLogin: () => void; onLogout: () => void;
}) {
  const isGuest = user.kind === "GUEST";

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Identity card */}
        <div className="flex items-center gap-3.5 bg-card border border-border rounded-2xl p-4">
          <Avatar m={{ id: user.id, name: user.name, color: user.avatarColor }} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-foreground text-sm truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isGuest ? "Guest · data tied to this device" : user.email}
            </p>
          </div>
        </div>

        {isGuest && (
          <div className="bg-primary/8 rounded-xl px-4 py-3.5 flex items-start gap-2.5">
            <span className="text-base mt-0.5">💡</span>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground leading-relaxed">
                You&apos;re using guest mode. Log in to a registered account to sync your groups elsewhere.
              </p>
              <button onClick={onGoLogin} className="text-xs font-bold text-primary hover:underline mt-1.5">
                Log in
              </button>
            </div>
          </div>
        )}

        {/* Appearance */}
        <section>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.18em] mb-2 px-1">Appearance</p>
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-sm font-semibold text-foreground mb-3">Theme</p>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map(t => (
                <button
                  key={t.value}
                  onClick={() => onTheme(t.value)}
                  className={`flex flex-col items-center gap-2 py-3 rounded-xl border-2 transition-all ${
                    theme === t.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50 hover:border-muted-foreground/30"
                  }`}
                >
                  {t.icon}
                  <span className="text-xs font-semibold">{t.label}</span>
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
              <p className="text-sm font-semibold text-red-500 dark:text-red-400">Sign out</p>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
