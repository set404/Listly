import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Check, Gift, Loader2 } from "lucide-react";
import { getPublicWishlist, type ApiPublicWishlist } from "../lib/api";
import { mapItem } from "../lib/mappers";
import type { ListItem } from "../types";

// ─── Public wishlist (read-only, no auth) ──────────────────────────────────────
//
// Reached via a shared link (/w/:token) — deliberately its own component
// rather than reusing ItemRow/QuickAddRow/ListScreen, since every control
// there is interactive and threading a readOnly prop through that whole
// tree for a one-off static view isn't worth it.

function PublicWishlistItemRow({ item }: { item: ListItem }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-1">
      <div
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
          item.completed ? "bg-primary border-primary" : "border-muted-foreground/30"
        }`}
      >
        {item.completed && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
      </div>
      {item.imageUrl && (
        <img src={item.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover border border-border flex-shrink-0" />
      )}
      <span className={`flex-1 text-sm leading-relaxed ${item.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
        {item.text}
      </span>
    </div>
  );
}

export function PublicWishlistScreen({ shareToken }: { shareToken: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<
    { status: "loading" } | { status: "error" } | { status: "ready"; data: ApiPublicWishlist }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    getPublicWishlist(shareToken)
      .then(data => { if (!cancelled) setState({ status: "ready", data }); })
      .catch(() => { if (!cancelled) setState({ status: "error" }); });
    return () => { cancelled = true; };
  }, [shareToken]);

  if (state.status === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <div className="w-16 h-16 rounded-3xl bg-muted flex items-center justify-center">
          <Gift className="w-7 h-7 text-muted-foreground" />
        </div>
        <p className="font-semibold text-foreground">{t("publicWishlist.invalidTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("publicWishlist.invalidBody")}</p>
      </div>
    );
  }

  const list = state.data.list;
  const items = (list?.items ?? []).map(mapItem);
  const active = items.filter(i => !i.completed);
  const done = items.filter(i => i.completed).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      <div className="px-4 pt-4 pb-2 border-b border-border flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl flex-shrink-0">
          {state.data.emoji}
        </div>
        <h2 className="flex-1 font-bold text-lg text-foreground truncate">{state.data.name}</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pt-1 pb-6">
        {items.length === 0 && (
          <div className="text-center pt-8 pb-2">
            <p className="text-sm text-muted-foreground">{t("publicWishlist.empty")}</p>
          </div>
        )}
        {active.map(item => <PublicWishlistItemRow key={item.id} item={item} />)}
        {done.length > 0 && (
          <div className="flex items-center gap-3 py-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">{t("listScreen.completed")}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}
        {done.map(item => <PublicWishlistItemRow key={item.id} item={item} />)}
      </div>
      <div className="px-4 py-3 border-t border-border text-center">
        <p className="text-xs text-muted-foreground">{t("publicWishlist.footer")}</p>
      </div>
    </div>
  );
}
