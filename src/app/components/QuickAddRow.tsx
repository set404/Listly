import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X, Loader2, ImagePlus } from "lucide-react";
import { CurrencyPicker } from "./CurrencyPicker";
import { compressImageToDataUrl } from "../lib/image";

// ─── Quick-add row (sits right after the last checkbox) ────────────────────────

export function QuickAddRow({ onAdd, showPrice, defaultCurrency }: {
  onAdd: (text: string, imageUrl?: string, price?: number, currency?: string) => void;
  showPrice?: boolean; defaultCurrency?: string;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency ?? "USD");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function submit() {
    const t = text.trim();
    if (!t) return;
    const parsedPrice = Number(price.trim());
    const hasPrice = price.trim() !== "" && Number.isFinite(parsedPrice) && parsedPrice >= 0;
    onAdd(t, imageDataUrl ?? undefined, hasPrice ? parsedPrice : undefined, hasPrice ? currency : undefined);
    setText("");
    setPrice("");
    setCurrency(defaultCurrency ?? "USD");
    setImageDataUrl(null);
    // Stay focused so pressing Enter repeatedly keeps adding items.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setCompressing(true);
    try {
      setImageDataUrl(await compressImageToDataUrl(file));
    } catch {
      // Best-effort attachment — a failed photo shouldn't block adding the item.
    } finally {
      setCompressing(false);
    }
  }

  return (
    <div className="flex items-center gap-3.5 py-3.5 px-1">
      <div className="w-6 h-6 rounded-full border-2 border-dashed border-muted-foreground/40 flex items-center justify-center flex-shrink-0">
        <Plus className="w-3.5 h-3.5 text-muted-foreground/50" />
      </div>
      <input
        ref={inputRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
        placeholder={t("quickAdd.placeholder")}
        autoComplete="off"
        className="flex-1 min-w-0 bg-transparent text-base md:text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
      />
      {showPrice && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={price}
            onChange={e => setPrice(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
            placeholder={t("itemRow.pricePlaceholder")}
            className="w-9 bg-transparent text-sm text-right tabular-nums text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          />
          <CurrencyPicker value={currency} onChange={setCurrency} />
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
      {imageDataUrl ? (
        <div className="relative flex-shrink-0">
          <img src={imageDataUrl} alt="" className="w-8 h-8 rounded-lg object-cover border border-border" />
          <button
            onClick={() => setImageDataUrl(null)}
            type="button"
            aria-label={t("quickAdd.removePhoto")}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          type="button"
          disabled={compressing}
          aria-label={t("quickAdd.attachPhoto")}
          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
        >
          {compressing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
}
