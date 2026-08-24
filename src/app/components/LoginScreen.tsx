import { useState, useRef } from "react";
import { motion } from "motion/react";
import { ChevronLeft, LogIn, UserRound } from "lucide-react";
import { Btn, Field } from "./ui-kit";
import { login, storeTokens, ApiError, type ApiUser } from "../lib/api";

export function LoginScreen({ showBack = true, onBack, onSuccess, onGoRegister, onContinueAsGuest, guestLoading }: {
  showBack?: boolean; onBack: () => void; onSuccess: (user: ApiUser) => void; onGoRegister: () => void;
  onContinueAsGuest: () => void; guestLoading?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pwRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError("");
    try {
      const { user, tokens } = await login(email.trim(), password);
      storeTokens(tokens);
      onSuccess(user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3">
        {showBack && (
          <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted -ml-1 transition-colors">
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-center px-7 pb-16 gap-7 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32 }}
          className="space-y-2"
        >
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-2">
            <LogIn className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Log in</h1>
          <p className="text-sm text-muted-foreground">Welcome back to Listly.</p>
        </motion.div>

        <div className="space-y-4">
          <Field
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && pwRef.current?.focus()}
            autoFocus
            autoComplete="email"
          />
          <Field
            ref={pwRef}
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
            error={error || undefined}
            autoComplete="current-password"
          />
          <Btn variant="primary" full size="lg" onClick={submit} loading={loading} disabled={!email.trim() || !password}>
            Log in
          </Btn>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Btn variant="outline" full size="lg" onClick={onContinueAsGuest} loading={guestLoading}>
          <UserRound className="w-4 h-4" />
          Continue as guest
        </Btn>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <button onClick={onGoRegister} className="font-semibold text-primary hover:underline">
            Register
          </button>
        </p>
      </div>
    </div>
  );
}
