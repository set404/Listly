import { useState, useEffect, useRef } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";
import { motion, AnimatePresence, useMotionValue, animate } from "motion/react";
import { useTranslation } from "react-i18next";
import { ImagePlus, ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import type { BonusCardVM } from "../types";
import { ZoomableImage } from "./ZoomableImage";

// ─── Bonus cards ────────────────────────────────────────────────────────────
//
// A group-owned, named set of images pinned to the bottom of the group's own
// page and every one of its list pages. Any member can add or remove one;
// they're stored on the group and show up everywhere that group's data is
// shown. Tapping a card opens it full-size with the option to delete it.

const cardSlideVariants = {
  enter: (dir: number) => ({ x: dir * -60, opacity: 0, scale: 0.96 }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (dir: number) => ({ x: dir * -60, opacity: 0, scale: 0.96 }),
};

// The lightbox is a carousel: swipe (or use the arrow buttons/arrow keys)
// to move between cards without closing and reopening. Swiping is disabled
// while the current image is pinch-zoomed, so it doesn't fight panning.
export function BonusCardRow({ cards, onAdd, onDelete }: {
  cards: BonusCardVM[]; onAdd: () => void; onDelete: (cardId: string) => void;
}) {
  const { t } = useTranslation();
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const dirRef = useRef(1);
  const zoomedRef = useRef(false);
  const dragX = useMotionValue(0);
  const gesture = useRef({ active: false, startX: 0 });
  const card = viewingIndex !== null ? cards[viewingIndex] : null;

  function go(delta: 1 | -1) {
    if (viewingIndex === null) return;
    dirRef.current = delta;
    setViewingIndex((viewingIndex + delta + cards.length) % cards.length);
  }

  function close() {
    setViewingIndex(null);
  }

  useEffect(() => {
    if (viewingIndex === null || cards.length < 2) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingIndex, cards.length]);

  function handleTouchStart(e: ReactTouchEvent) {
    if (cards.length < 2 || zoomedRef.current || e.touches.length !== 1) return;
    gesture.current = { active: true, startX: e.touches[0].clientX };
  }
  function handleTouchMove(e: ReactTouchEvent) {
    if (!gesture.current.active || zoomedRef.current) return;
    dragX.set(e.touches[0].clientX - gesture.current.startX);
  }
  function handleTouchEnd() {
    if (!gesture.current.active) return;
    gesture.current.active = false;
    const dx = dragX.get();
    const SWIPE_THRESHOLD = 70;
    if (dx <= -SWIPE_THRESHOLD) { dragX.set(0); go(1); }
    else if (dx >= SWIPE_THRESHOLD) { dragX.set(0); go(-1); }
    else animate(dragX, 0, { type: "spring", stiffness: 400, damping: 34 });
  }

  return (
    <div className="px-4 pb-4 pt-1 flex-shrink-0">
      <div className="flex gap-2.5 overflow-x-auto">
        {cards.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setViewingIndex(i)}
            className="flex-shrink-0 w-20 text-center"
          >
            <div className="w-20 h-20 rounded-2xl overflow-hidden border border-border shadow-sm">
              <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover" />
            </div>
            <p className="text-[11px] font-medium text-muted-foreground mt-1 truncate">{c.name}</p>
          </button>
        ))}
        <button
          type="button"
          onClick={onAdd}
          aria-label={t("bonusCard.addAria")}
          className="flex-shrink-0 w-20 h-20 rounded-2xl border-2 border-dashed border-border bg-muted/40 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <ImagePlus className="w-5 h-5" />
          <span className="text-[10px] font-semibold">{t("bonusCard.add")}</span>
        </button>
      </div>

      <AnimatePresence>
        {card && (
          <motion.div
            key="bonus-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-6 gap-4"
          >
            <AnimatePresence mode="popLayout" initial={false} custom={dirRef.current}>
              <motion.div
                key={card.id}
                custom={dirRef.current}
                variants={cardSlideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                onClick={e => e.stopPropagation()}
                className="flex flex-col items-center gap-4 max-w-full"
              >
                <motion.div style={{ x: dragX }} className="max-w-full max-h-[65vh]">
                  <ZoomableImage
                    src={card.imageUrl}
                    alt={card.name}
                    onZoomChange={z => { zoomedRef.current = z; }}
                    className="max-w-full max-h-[65vh] rounded-2xl object-contain"
                  />
                </motion.div>
                <p className="text-white font-semibold text-base text-center px-4">{card.name}</p>
                {cards.length > 1 && (
                  <p className="text-white/60 text-xs font-semibold tabular-nums -mt-2">{viewingIndex! + 1} / {cards.length}</p>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={close}
                    type="button"
                    className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors"
                  >
                    {t("bonusCard.close")}
                  </button>
                  <button
                    onClick={() => { onDelete(card.id); close(); }}
                    type="button"
                    className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t("bonusCard.delete")}
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>

            {cards.length > 1 && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); go(-1); }}
                  type="button"
                  aria-label={t("bonusCard.previous")}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); go(1); }}
                  type="button"
                  aria-label={t("bonusCard.next")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            <button
              onClick={close}
              type="button"
              aria-label={t("bonusCard.close")}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
