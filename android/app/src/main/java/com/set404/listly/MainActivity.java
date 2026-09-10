package com.set404.listly;

import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import java.util.Locale;

public class MainActivity extends BridgeActivity {

    // Backing store for the current system bar insets, in CSS px (dp).
    // Volatile because WindowInsetsCompat updates land on the UI thread
    // while WebView's JS engine reads these from its own thread.
    private volatile float insetTop, insetBottom, insetLeft, insetRight;

    // Exposed to the page as window.AndroidInsets. Pushing values into the
    // WebView via evaluateJavascript at onCreate time races the WebView's
    // own page load (the injected script can land on the still-loading
    // about:blank document and get wiped out the moment the real app page
    // navigates in), so instead the web app pulls the current values
    // synchronously on boot, before it applies any layout.
    public class InsetsBridge {
        @JavascriptInterface
        public float top() { return insetTop; }
        @JavascriptInterface
        public float bottom() { return insetBottom; }
        @JavascriptInterface
        public float left() { return insetLeft; }
        @JavascriptInterface
        public float right() { return insetRight; }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Android 15+ enforces edge-to-edge drawing, so the WebView renders
        // behind the status/navigation bars. Read the real system bar
        // insets and forward them to the page instead of a fixed padding
        // baked in at build time.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new InsetsBridge(), "AndroidInsets");

        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            float density = getResources().getDisplayMetrics().density;
            insetTop = bars.top / density;
            insetBottom = bars.bottom / density;
            insetLeft = bars.left / density;
            insetRight = bars.right / density;

            // Live-update path for changes that happen after the page has
            // already loaded (rotation, switching gesture/3-button nav,
            // entering multi-window). No-op if the page hasn't defined the
            // hook yet (e.g. this very first dispatch, before boot).
            String js = String.format(
                Locale.US,
                "window.__applySafeAreaInsets && window.__applySafeAreaInsets(%.2f,%.2f,%.2f,%.2f);",
                insetTop, insetBottom, insetLeft, insetRight
            );
            webView.evaluateJavascript(js, null);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(webView);
    }
}
