import { useState, useRef } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, UserPlus } from "lucide-react";
import { Btn, Field } from "./ui-kit";
import { register, storeTokens, ApiError, type ApiUser } from "../lib/api";

export function RegisterScreen({ onBack, onSuccess, onGoLogin }: {
  onBack: () => void; onSuccess: (user: ApiUser) => void; onGoLogin: () => void;
}) {
  const { t } = useTranslation();
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
      setError(e instanceof ApiError ? e.message : t("auth.genericError"));
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
          <h1 className="text-2xl font-bold text-foreground">{t("auth.register.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("auth.register.subtitle")}</p>
        </motion.div>

        <div className="space-y-4">
          <Field
            label={t("auth.register.nameLabel")}
            placeholder={t("auth.register.namePlaceholder")}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && emailRef.current?.focus()}
            autoFocus
            autoComplete="name"
          />
          <Field
            ref={emailRef}
            label={t("auth.register.emailLabel")}
            type="email"
            placeholder={t("auth.register.emailPlaceholder")}
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && pwRef.current?.focus()}
            autoComplete="email"
          />
          <Field
            ref={pwRef}
            label={t("auth.register.passwordLabel")}
            type="password"
            placeholder={t("auth.register.passwordPlaceholder")}
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
            error={error || undefined}
            hint={!error ? t("auth.register.passwordHint") : undefined}
            autoComplete="new-password"
          />
          <Btn variant="primary" full size="lg" onClick={submit} loading={loading} disabled={!canSubmit}>
            {t("auth.register.submit")}
          </Btn>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          {t("auth.register.haveAccount")}{" "}
          <button onClick={onGoLogin} className="font-semibold text-primary hover:underline">
            {t("auth.register.loginLink")}
          </button>
        </p>
      </div>
    </div>
  );
}
