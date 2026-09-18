import { Loader2 } from "lucide-react";

// A specific group/wishlist/expense-group's full detail is fetched lazily,
// only once its screen is entered (see the "fetch on enter" effects) — this
// fills the gap between landing on the screen (its summary, e.g. cg, is
// already in state) and that fetch resolving, instead of flashing a
// misleadingly empty list/expense feed.
export function ScreenLoading() {
  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
    </div>
  );
}
