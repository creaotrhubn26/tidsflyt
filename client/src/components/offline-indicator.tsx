import { useEffect, useState } from "react";
import { CloudOff, Cloud, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { subscribe as subscribeQueue, drainQueue } from "@/lib/offline-queue";
import { countMutations } from "@/lib/offline-db";

/**
 * Small fixed-position indicator. Hidden when online AND zero pending.
 *
 *   - Offline, no pending  → "Frakoblet"
 *   - Offline, N pending   → "Frakoblet — N venter på sync"
 *   - Online, N pending    → "Synker N…" (auto-drain runs on `online` event)
 *   - Online, zero pending → hidden
 */
export function OfflineIndicator() {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [pending, setPending] = useState<number>(0);
  const [syncing, setSyncing] = useState<boolean>(false);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const unsub = subscribeQueue((n) => setPending(n));
    // Seed initial count
    countMutations().then(setPending).catch(() => { /* ignore */ });
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      unsub();
    };
  }, []);

  // When the queue has entries and we're online, show "syncing" briefly while drain runs.
  useEffect(() => {
    if (!online || pending === 0) { setSyncing(false); return; }
    setSyncing(true);
    drainQueue()
      .catch(() => { /* swallow */ })
      .finally(() => setSyncing(false));
  }, [online, pending === 0 ? 0 : 1]); // re-run when online flips or pending transitions from 0 to >0

  if (online && pending === 0) return null;

  const label = !online
    ? pending === 0 ? "Frakoblet" : `Frakoblet — ${pending} venter`
    : syncing ? `Synker ${pending}…` : `${pending} venter`;

  const Icon = !online ? CloudOff : syncing ? Loader2 : Cloud;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-indicator"
      className={cn(
        "fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full px-3 py-2 text-sm shadow-lg",
        "border backdrop-blur-sm",
        !online
          ? "bg-amber-50/95 text-amber-900 border-amber-200 dark:bg-amber-950/80 dark:text-amber-100 dark:border-amber-800"
          : "bg-blue-50/95 text-blue-900 border-blue-200 dark:bg-blue-950/80 dark:text-blue-100 dark:border-blue-800",
      )}
    >
      <Icon className={cn("h-4 w-4", syncing && "animate-spin")} />
      <span className="font-medium tabular-nums">{label}</span>
    </div>
  );
}
