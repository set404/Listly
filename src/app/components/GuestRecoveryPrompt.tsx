import { AnimatePresence, motion } from "motion/react";
import { UserRound } from "lucide-react";
import { Btn } from "./ui-kit";
import type { RecoveryCandidate } from "../lib/auth";

export function GuestRecoveryPrompt({ candidate, loading, onAccept, onDecline }: {
  candidate: RecoveryCandidate | null;
  loading: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <AnimatePresence>
      {candidate && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-[1px] z-[70]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 480, damping: 34 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-3xl p-6 shadow-2xl z-[70] flex flex-col items-center text-center gap-4"
            style={{ width: "calc(100% - 40px)" }}
          >
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <UserRound className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-bold text-foreground text-base mb-1.5">Is this you?</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We found a recent guest session for <span className="font-semibold text-foreground">{candidate.name}</span> on
                this device. Restore it to get your groups back, or start fresh.
              </p>
            </div>
            <div className="flex gap-3 w-full mt-1">
              <Btn variant="outline" full onClick={onDecline} disabled={loading}>Start fresh</Btn>
              <Btn variant="primary" full onClick={onAccept} loading={loading}>Restore</Btn>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
