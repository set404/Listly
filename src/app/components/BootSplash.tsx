import { useTranslation } from "react-i18next";
import { ShoppingBag, Loader2 } from "lucide-react";
import { Btn } from "./ui-kit";

export function BootSplash({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-background gap-5 px-8 h-full">
      <div className="w-16 h-16 rounded-[22px] bg-primary flex items-center justify-center shadow-xl shadow-primary/30">
        <ShoppingBag className="w-8 h-8 text-primary-foreground" />
      </div>
      {error ? (
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground max-w-[240px]">{error}</p>
          <Btn variant="outline" size="sm" onClick={onRetry}>{t("common.tryAgain")}</Btn>
        </div>
      ) : (
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
      )}
    </div>
  );
}
