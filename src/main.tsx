
  import { createRoot } from "react-dom/client";
  import { HashRouter } from "react-router";
  import App from "./app/App.tsx";
  import "./styles/index.css";

  declare global {
    interface Window {
      AndroidInsets?: {
        top(): number;
        bottom(): number;
        left(): number;
        right(): number;
      };
      __applySafeAreaInsets?: (top: number, bottom: number, left: number, right: number) => void;
    }
  }

  // Android's WebView doesn't populate CSS env(safe-area-inset-*) the way
  // iOS's WKWebView does, so MainActivity exposes the real system bar
  // insets via a synchronous JS interface (window.AndroidInsets) and pushes
  // live updates (rotation, nav bar mode changes) by calling this hook.
  // Read synchronously here, before the first paint, so layout never
  // flashes under the status/nav bars.
  function applySafeAreaInsets(top: number, bottom: number, left: number, right: number) {
    const root = document.documentElement.style;
    root.setProperty("--safe-area-inset-top", `${top}px`);
    root.setProperty("--safe-area-inset-bottom", `${bottom}px`);
    root.setProperty("--safe-area-inset-left", `${left}px`);
    root.setProperty("--safe-area-inset-right", `${right}px`);
  }
  window.__applySafeAreaInsets = applySafeAreaInsets;
  if (window.AndroidInsets) {
    applySafeAreaInsets(
      window.AndroidInsets.top(),
      window.AndroidInsets.bottom(),
      window.AndroidInsets.left(),
      window.AndroidInsets.right()
    );
  }

  createRoot(document.getElementById("root")!).render(
    <HashRouter>
      <App />
    </HashRouter>
  );
