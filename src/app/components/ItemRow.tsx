import { useState, useRef } from "react";
import { motion, AnimatePresence, Reorder, useDragControls } from "motion/react";
import { useTranslation } from "react-i18next";
import { GripVertical, Check, ImagePlus, Loader2, DollarSign, Trash2, X } from "lucide-react";
import { CurrencyPicker } from "./CurrencyPicker";
import { ZoomableImage } from "./ZoomableImage";
import { compressImageToDataUrl } from "../lib/image";
import { formatMoney } from "../lib/currencies";
import type { ListItem } from "../types";

// ─── List item row ────────────────────────────────────────────────────────────

export function ItemRow({ item, reorderable, onDragEnd, onToggle, onEdit, onDelete, onSetImage, showPrice, defaultCurrency, onSetPrice }: {
  item: ListItem; reorderable?: boolean; onDragEnd?: () => void;
  onToggle: () => void; onEdit: (text: string) => void; onDelete: () => void;
  onSetImage: (imageUrl: string) => void;
  showPrice?: boolean; defaultCurrency?: string;
  onSetPrice?: (price: number | null, currency?: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [attachingPhoto, setAttachingPhoto] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceDraft, setPriceDraft] = useState(item.price != null ? String(item.price) : "");
  const [currencyDraft, setCurrencyDraft] = useState(item.currency ?? defaultCurrency ?? "USD");
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const dragControls = useDragControls();

  function startEditPrice() {
    setPriceDraft(item.price != null ? String(item.price) : "");
    setCurrencyDraft(item.currency ?? defaultCurrency ?? "USD");
    setEditingPrice(true);
    requestAnimationFrame(() => priceInputRef.current?.select());
  }

  function commitPrice(currencyOverride?: string) {
    setEditingPrice(false);
    const nextCurrency = currencyOverride ?? currencyDraft;
    const trimmed = priceDraft.trim();
    if (trimmed === "") {
      if (item.price != null) onSetPrice?.(null);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setPriceDraft(item.price != null ? String(item.price) : "");
      return;
    }
    if (parsed !== item.price || nextCurrency !== item.currency) onSetPrice?.(parsed, nextCurrency);
  }

  function pickCurrency(currency: string) {
    setCurrencyDraft(currency);
    commitPrice(currency);
  }

  function startEdit() {
    setDraft(item.text);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function commit() {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== item.text) onEdit(t);
    else setDraft(item.text);
  }

  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setAttachingPhoto(true);
    try {
      onSetImage(await compressImageToDataUrl(file));
    } catch {
      // Best-effort attachment — a failed photo isn't worth surfacing an error for.
    } finally {
      setAttachingPhoto(false);
    }
  }

  const rowProps = {
    layout: "position" as const,
    initial: { opacity: 0, y: -6 },
    animate: { opacity: item.completed ? 0.6 : 1, y: 0 },
    exit: { opacity: 0 },
    transition: { duration: 0.2 },
    className: `flex items-center gap-3.5 py-3.5 px-1 rounded-xl transition-colors ${!item.completed ? "hover:bg-muted/40" : ""}`,
  };

  const content = (
    <>
      {reorderable && (
        // data-drag-item lets PullToRefresh's own touch handling know to
        // back off for a touch starting here, instead of racing Motion's
        // drag gesture for the same touch (both listen for vertical
        // movement, and PullToRefresh doesn't know about item drags).
        <button
          type="button"
          data-drag-item="true"
          onPointerDown={e => dragControls.start(e)}
          aria-label={t("itemRow.reorder")}
          className="flex-shrink-0 w-5 h-5 -ml-1 flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      )}
      <button
        onClick={onToggle}
        type="button"
        className="flex-shrink-0"
        aria-label={item.completed ? t("itemRow.markIncomplete") : t("itemRow.markComplete")}
      >
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
          item.completed ? "bg-emerald-500 border-emerald-500" : "border-border hover:border-primary/60"
        }`}>
          <AnimatePresence mode="wait">
            {item.completed && (
              <motion.div
                key="c"
                initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 600, damping: 22 }}
              >
                <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </button>
      {item.imageUrl ? (
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label={t("itemRow.viewPhoto")}
          className="flex-shrink-0"
        >
          <img
            src={item.imageUrl}
            alt=""
            className="w-9 h-9 rounded-lg object-cover border border-border"
          />
        </button>
      ) : (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoPick}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={attachingPhoto}
            aria-label={t("itemRow.addPhoto")}
            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            {attachingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
          </button>
        </>
      )}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { setDraft(item.text); setEditing(false); }
          }}
          autoComplete="off"
          className="flex-1 min-w-0 bg-transparent text-base md:text-sm leading-relaxed text-foreground focus:outline-none"
        />
      ) : (
        <span
          onClick={startEdit}
          className={`flex-1 min-w-0 break-words text-sm leading-relaxed transition-all cursor-text ${item.completed ? "line-through text-muted-foreground" : "text-foreground"}`}
        >
          {item.text}
        </span>
      )}
      {showPrice && (
        editingPrice ? (
          <div
            className="flex items-center gap-0.5 flex-shrink-0"
            onBlur={e => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commitPrice();
            }}
          >
            <input
              ref={priceInputRef}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={priceDraft}
              onChange={e => setPriceDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); commitPrice(); }
                if (e.key === "Escape") { setPriceDraft(item.price != null ? String(item.price) : ""); setEditingPrice(false); }
              }}
              placeholder={t("itemRow.pricePlaceholder")}
              className="w-9 bg-transparent text-xs text-right tabular-nums text-muted-foreground focus:outline-none border-b border-dashed border-border"
            />
            <CurrencyPicker value={currencyDraft} onChange={pickCurrency} />
          </div>
        ) : (
          <button
            type="button"
            onClick={startEditPrice}
            aria-label={t("itemRow.editPrice")}
            className="flex-shrink-0 text-[11px] font-semibold tabular-nums px-1 py-0.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {item.price != null
              ? formatMoney(item.price, item.currency ?? defaultCurrency ?? "USD", i18n.language)
              : <DollarSign className="w-3.5 h-3.5" />}
          </button>
        )
      )}
      <button
        onClick={onDelete}
        type="button"
        aria-label={t("itemRow.deleteAria", { text: item.text })}
        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:bg-red-500/10 hover:text-red-500 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      <AnimatePresence>
        {lightboxOpen && item.imageUrl && (
          <motion.div
            key="lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxOpen(false)}
            className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              onClick={e => e.stopPropagation()}
              className="max-w-full max-h-full"
            >
              <ZoomableImage
                src={item.imageUrl}
                alt=""
                className="max-w-full max-h-full rounded-2xl object-contain"
              />
            </motion.div>
            <button
              onClick={() => setLightboxOpen(false)}
              type="button"
              aria-label={t("itemRow.close")}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  if (reorderable) {
    return (
      <Reorder.Item value={item.clientId} dragListener={false} dragControls={dragControls} onDragEnd={onDragEnd} {...rowProps}>
        {content}
      </Reorder.Item>
    );
  }
  return <motion.div {...rowProps}>{content}</motion.div>;
}
