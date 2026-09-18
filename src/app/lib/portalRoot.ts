// Portaled overlays (dropdown popovers, etc.) need to render inside the
// same subtree that carries the "dark" class — dark mode is toggled on a
// specific wrapper div (#app-theme-root in App.tsx), not <html>/<body>, so
// portaling straight to document.body would escape it and fall back to
// light-mode colors regardless of the app's actual theme.
export function getPortalRoot(): Element {
  return document.getElementById("app-theme-root") ?? document.body;
}
