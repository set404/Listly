import { useState, useRef } from "react";
import { motion } from "motion/react";
import { AlertCircle, ChevronLeft, LogIn, UserRound } from "lucide-react";
import { Btn, Field } from "./ui-kit";
import { login, loginWithGoogle, storeTokens, ApiError, type ApiUser } from "../lib/api";
import { signInWithGoogle } from "../lib/googleAuth";

export function LoginScreen({ showBack = true, onBack, onSuccess, onGoRegister, onContinueAsGuest, guestLoading }: {
  showBack?: boolean; onBack: () => void; onSuccess: (user: ApiUser) => void; onGoRegister: () => void;
  onContinueAsGuest: () => void; guestLoading?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [googleError, setGoogleError] = useState("");
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

  async function submitGoogle() {
    setGoogleLoading(true);
    setGoogleError("");
    try {
      const idToken = await signInWithGoogle();
      const { user, tokens } = await loginWithGoogle(idToken);
      storeTokens(tokens);
      onSuccess(user);
    } catch (e) {
      setGoogleError(e instanceof ApiError ? e.message : "Google sign-in failed. Try again.");
    } finally {
      setGoogleLoading(false);
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

        <div className="space-y-2">
          <Btn variant="outline" full size="lg" onClick={submitGoogle} loading={googleLoading}>
            <GoogleIcon className="w-4 h-4" />
            Continue with Google
          </Btn>
          {googleError && (
            <p className="text-xs text-red-500 flex items-center gap-1.5 justify-center">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{googleError}
            </p>
          )}
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

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.82Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.61H1.27A12 12 0 0 0 0 12c0 1.94.47 3.77 1.27 5.39l4-3.11Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.61l4 3.11C6.22 6.86 8.87 4.75 12 4.75Z" />
    </svg>
  );
}
