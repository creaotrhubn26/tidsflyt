import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installOfflineQueue } from "./lib/offline-queue";

// Remove the SEO-only H1 once React takes over (prevents duplicate H1 with page-level H1)
document.getElementById("seo-h1")?.remove();

// Register the app-shell service worker (production only — dev uses Vite HMR).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[sw] registration failed:", err);
    });
  });
}

// Offline mutation queue — listens to online events + periodic drain.
installOfflineQueue();

createRoot(document.getElementById("root")!).render(<App />);
