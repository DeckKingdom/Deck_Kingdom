import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// installable app: register the service worker (live site only)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

// A tab opened before a deploy may ask for a lazy-loaded chunk the new build no
// longer ships (the PDF maker, say) — the import 404s. When that happens, pull
// the fresh build in by reloading, at most once every 2 minutes so a genuine
// outage can't reload-loop. Unsaved edits are safe: the beforeunload warning
// still asks first.
window.addEventListener("vite:preloadError", () => {
  let last = 0;
  try { last = Number(sessionStorage.getItem("dk-stale-reload") || 0); } catch (e) { /* fine */ }
  if (Date.now() - last < 120000) return;
  try { sessionStorage.setItem("dk-stale-reload", String(Date.now())); } catch (e) { /* fine */ }
  window.location.reload();
});
