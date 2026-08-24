import { useState, useRef } from "react";
import { motion } from "motion/react";
import { ChevronLeft, UserPlus } from "lucide-react";
import { Btn, Field } from "./ui-kit";
import { register, storeTokens, ApiError, type ApiUser } from "../lib/api";

export function RegisterScreen({ onBack, onSuccess, onGoLogin }: {
  onBack: () => void; onSuccess: (user: ApiUser) => void; onGoLogin: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  const canSubmit = name.trim() && email.trim() && password.length >= 8;

  async function submit() {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    try {
      const { user, tokens } = await register(email.trim(), password, name.trim());
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
        <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted -ml-1 transition-colors">
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center px-7 pb-16 gap-8 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32 }}
          className="space-y-2"
        >
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-2">
            <UserPlus className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Create account</h1>
          <p className="text-sm text-muted-foreground">Keep your groups and lists synced everywhere.</p>
        </motion.div>

        <div className="space-y-4">
          <Field
            label="Name"
            placeholder="Alex Chen"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && emailRef.current?.focus()}
            autoFocus
            autoComplete="name"
          />
          <Field
            ref={emailRef}
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && pwRef.current?.focus()}
            autoComplete="email"
          />
          <Field
            ref={pwRef}
            label="Password"
            type="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
            error={error || undefined}
            hint={!error ? "At least 8 characters" : undefined}
            autoComplete="new-password"
          />
          <Btn variant="primary" full size="lg" onClick={submit} loading={loading} disabled={!canSubmit}>
            Create account
          </Btn>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <button onClick={onGoLogin} className="font-semibold text-primary hover:underline">
            Log in
          </button>
        </p>
      </div>
    </div>
  );
}
