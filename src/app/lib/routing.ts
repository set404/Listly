export type Screen =
  | "login" | "register" | "groups" | "profile" | "lists" | "list" | "settings" | "members" | "invite"
  | "wishlists" | "wishlist" | "public-wishlist"
  | "expenseGroups" | "expenseGroup" | "expenseGroupSettings" | "expenseGroupMembers" | "expenseGroupInvite"
  | "unknown";
export type TabScreen = "groups" | "expenseGroups" | "wishlists" | "profile";

// ─── Route parsing ─────────────────────────────────────────────────────────
//
// The app has no server behind it (it's shipped as a static bundle, and as a
// Capacitor app on Android), so we route entirely on the client with
// HashRouter. Every screen change pushes a real history entry so the browser
// / hardware back button walks backward through actual navigation instead of
// leaving the whole app on a single route.

export interface RouteMatch {
  screen: Screen;
  groupId: string | null;
  listId: string | null;
  wishlistId: string | null;
  shareToken: string | null;
}

const EMPTY_ROUTE_IDS = { groupId: null, listId: null, wishlistId: null, shareToken: null };

export function parseRoute(pathname: string): RouteMatch {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "login") return { screen: "login", ...EMPTY_ROUTE_IDS };
  if (parts[0] === "register") return { screen: "register", ...EMPTY_ROUTE_IDS };
  if (parts[0] === "profile") return { screen: "profile", ...EMPTY_ROUTE_IDS };
  // Public, unauthenticated share link — a wishlist's read-only view.
  if (parts[0] === "w" && parts[1]) {
    return { screen: "public-wishlist", ...EMPTY_ROUTE_IDS, shareToken: parts[1] };
  }
  if (parts[0] === "wishlists") {
    if (!parts[1]) return { screen: "wishlists", ...EMPTY_ROUTE_IDS };
    return { screen: "wishlist", ...EMPTY_ROUTE_IDS, wishlistId: parts[1] };
  }
  if (parts[0] === "groups") {
    if (!parts[1]) return { screen: "groups", ...EMPTY_ROUTE_IDS };
    const groupId = parts[1];
    const sub = parts[2];
    if (!sub) return { screen: "lists", ...EMPTY_ROUTE_IDS, groupId };
    if (sub === "list" && parts[3]) return { screen: "list", ...EMPTY_ROUTE_IDS, groupId, listId: parts[3] };
    if (sub === "settings") return { screen: "settings", ...EMPTY_ROUTE_IDS, groupId };
    if (sub === "members") return { screen: "members", ...EMPTY_ROUTE_IDS, groupId };
    if (sub === "invite") return { screen: "invite", ...EMPTY_ROUTE_IDS, groupId };
  }
  if (parts[0] === "expense-groups") {
    if (!parts[1]) return { screen: "expenseGroups", ...EMPTY_ROUTE_IDS };
    const groupId = parts[1];
    const sub = parts[2];
    if (!sub) return { screen: "expenseGroup", ...EMPTY_ROUTE_IDS, groupId };
    if (sub === "settings") return { screen: "expenseGroupSettings", ...EMPTY_ROUTE_IDS, groupId };
    if (sub === "members") return { screen: "expenseGroupMembers", ...EMPTY_ROUTE_IDS, groupId };
    if (sub === "invite") return { screen: "expenseGroupInvite", ...EMPTY_ROUTE_IDS, groupId };
  }
  return { screen: "unknown", ...EMPTY_ROUTE_IDS };
}
