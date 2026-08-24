import { forwardRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, Loader2, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AvatarColor = "indigo" | "rose" | "amber" | "emerald" | "sky" | "orange" | "pink" | "violet";
export type ThemeMode = "light" | "dark" | "system";

export interface Member {
  id: string;
  name: string;
  color: AvatarColor;
  isCurrentUser?: boolean;
}

// ─── Avatar colors ────────────────────────────────────────────────────────────

export const AV: Record<AvatarColor, string> = {
  indigo:  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300",
  rose:    "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
  amber:   "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  sky:     "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
  orange:  "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  pink:    "bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300",
  violet:  "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
};

export const initials = (n: string) => n.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

// ─── Avatar ───────────────────────────────────────────────────────────────────

export function Avatar({ m, size = "md" }: { m: Member; size?: "xs" | "sm" | "md" | "lg" | "xl" }) {
  const sz = {
    xs: "w-6 h-6 text-[9px]",
    sm: "w-8 h-8 text-[10px]",
    md: "w-10 h-10 text-xs",
    lg: "w-12 h-12 text-sm",
    xl: "w-14 h-14 text-sm",
  };
  return (
    <div className={`rounded-full flex items-center justify-center font-bold flex-shrink-0 ${AV[m.color]} ${sz[size]}`}>
      {initials(m.name)}
    </div>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────

type BV = "primary" | "secondary" | "ghost" | "outline" | "danger";

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BV;
  size?: "sm" | "md" | "lg";
  full?: boolean;
  loading?: boolean;
}

export function Btn({ variant = "primary", size = "md", full, loading, className = "", disabled, children, ...rest }: BtnProps) {
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-2xl transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none select-none";
  const V: Record<BV, string> = {
    primary:   "bg-primary text-primary-foreground hover:opacity-90 shadow-sm shadow-primary/25",
    secondary: "bg-secondary text-secondary-foreground hover:opacity-80",
    ghost:     "text-muted-foreground hover:bg-muted hover:text-foreground",
    outline:   "border-2 border-border text-foreground hover:bg-muted",
    danger:    "bg-red-500 text-white hover:bg-red-600",
  };
  const S = { sm: "px-3.5 py-2 text-sm", md: "px-5 py-3 text-sm", lg: "px-6 py-3.5 text-[15px]" };
  return (
    <button
      className={`${base} ${V[variant]} ${S[size]} ${full ? "w-full" : ""} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />}
      {children}
    </button>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────

export const Field = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; hint?: string }
>(({ label, error, hint, className = "", ...p }, ref) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className="text-sm font-semibold text-foreground">{label}</label>}
    <input
      ref={ref}
      className={`w-full px-4 py-3.5 rounded-2xl bg-muted/80 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-sm border ${error ? "border-red-400" : "border-transparent focus:border-primary/20"} ${className}`}
      {...p}
    />
    {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
    {error && (
      <p className="text-xs text-red-500 flex items-center gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
      </p>
    )}
  </div>
));
Field.displayName = "Field";

// ─── Bottom Sheet (absolute-positioned, stays inside phone frame) ──────────────

export function Sheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title?: string; children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px] z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 42 }}
            className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[28px] z-50 shadow-2xl overflow-hidden"
            style={{ maxHeight: "90%" }}
          >
            <div className="flex justify-center pt-3.5">
              <div className="w-10 h-1 rounded-full bg-foreground/10" />
            </div>
            {title && (
              <div className="flex items-center justify-between px-6 pt-4 pb-0">
                <h3 className="text-xl font-bold text-foreground">{title}</h3>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            )}
            <div
              className="px-6 pb-10 pt-4 overflow-y-auto"
              style={{ maxHeight: "calc(90% - 68px)" }}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Confirm Dialog (absolute-positioned) ────────────────────────────────────

export function Confirm({ open, onClose, title, body, cta = "Confirm", danger, onConfirm }: {
  open: boolean; onClose: () => void; title: string; body: string;
  cta?: string; danger?: boolean; onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-[1px] z-[60]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 480, damping: 34 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-3xl p-6 shadow-2xl z-[60]"
            style={{ width: "calc(100% - 40px)" }}
          >
            <p className="font-bold text-foreground text-base mb-2">{title}</p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">{body}</p>
            <div className="flex gap-3">
              <Btn variant="outline" full onClick={onClose}>Cancel</Btn>
              <Btn variant={danger ? "danger" : "primary"} full onClick={onConfirm}>{cta}</Btn>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Toast (absolute-positioned) ─────────────────────────────────────────────

export function Toast({ msg, show }: { msg: string; show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.88 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.95 }}
          className="absolute bottom-28 left-1/2 -translate-x-1/2 z-[100] bg-foreground text-background text-xs font-semibold px-5 py-2.5 rounded-full shadow-xl pointer-events-none whitespace-nowrap"
        >
          {msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
