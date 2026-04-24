/**
 * client/src/lib/offline-queue.ts
 *
 * Orchestrator for the offline mutation queue. Exposes:
 *
 *   - `enqueueMutation(url, method, body, headers?)` — used by the fetch
 *     interceptor when the network is unreachable.
 *   - `drainQueue()` — replays queued mutations in insertion order. Stops on
 *     the first 5xx/network error; 4xx are dropped (treated as resolved).
 *   - `subscribe(cb)` — notifies listeners when queue size changes (UI badge).
 *   - Auto-drain: listens to `online` events + a periodic 30s tick when
 *     entries are pending.
 *
 * Policy (Nivå B):
 *   - Client generates the entity `id` (UUID) before enqueue so the replayed
 *     POST carries the same id every time → server-side idempotency via
 *     ON CONFLICT DO NOTHING.
 *   - 4xx responses = "won't fix by retrying" → drop queue entry, emit event.
 *   - 5xx / network fail → keep in queue, bump attempts, try next drain.
 */

import {
  addMutation, countMutations, deleteMutation, listMutations, updateMutation,
  type QueuedMutation,
} from "./offline-db";

export interface EnqueueArgs {
  url: string;
  method: QueuedMutation["method"];
  body?: unknown;
  headers?: Record<string, string>;
}

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

function notify(count: number) {
  listeners.forEach((l) => {
    try { l(count); } catch { /* ignore subscriber errors */ }
  });
}

export function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  // Emit current state immediately
  countMutations().then(notify).catch(() => { /* noop */ });
  return () => { listeners.delete(cb); };
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback — non-cryptographic but unique enough for queue keys
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** URLs that are safe to queue offline — writes that create/edit user-owned data. */
const WHITELISTED_PREFIXES = [
  "/api/logs",
  "/api/time-entries",
  "/api/timer-session",
  "/api/travel-legs",
];

export function isQueueableUrl(url: string): boolean {
  const path = url.split("?")[0];
  return WHITELISTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
}

export function isQueueableMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m === "POST" || m === "PATCH" || m === "PUT" || m === "DELETE";
}

export async function enqueueMutation(args: EnqueueArgs): Promise<QueuedMutation> {
  const id = uuid();
  const mutation: QueuedMutation = {
    id,
    url: args.url,
    method: args.method,
    body: args.body != null ? JSON.stringify(args.body) : null,
    headers: args.headers ?? { "Content-Type": "application/json" },
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
    lastAttemptAt: null,
  };
  await addMutation(mutation);
  const count = await countMutations();
  notify(count);
  return mutation;
}

let draining = false;
let drainTimer: ReturnType<typeof setTimeout> | null = null;

export async function drainQueue(): Promise<{ sent: number; remaining: number; dropped: number }> {
  if (draining) return { sent: 0, remaining: await countMutations(), dropped: 0 };
  draining = true;
  let sent = 0;
  let dropped = 0;
  try {
    const items = await listMutations();
    for (const item of items) {
      try {
        const res = await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body ?? undefined,
          credentials: "include",
        });
        if (res.ok || res.status === 204) {
          await deleteMutation(item.id);
          sent++;
        } else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          // Client error that won't fix on retry — drop.
          const errText = (await res.text().catch(() => "")).slice(0, 200);
          console.warn(`[offline-queue] drop ${item.method} ${item.url} → ${res.status}: ${errText}`);
          await deleteMutation(item.id);
          dropped++;
        } else {
          // 5xx, 408, 429 — keep, bump attempts.
          await updateMutation({
            ...item,
            attempts: item.attempts + 1,
            lastError: `HTTP ${res.status}`,
            lastAttemptAt: Date.now(),
          });
          break; // don't hammer — stop draining on transient failure
        }
      } catch (err: any) {
        // Network error — keep in queue.
        await updateMutation({
          ...item,
          attempts: item.attempts + 1,
          lastError: String(err?.message || err),
          lastAttemptAt: Date.now(),
        });
        break;
      }
    }
  } finally {
    draining = false;
    const remaining = await countMutations();
    notify(remaining);
    return { sent, remaining, dropped } as any;
  }
}

function scheduleDrain(delayMs = 30_000) {
  if (drainTimer) return;
  drainTimer = setTimeout(async () => {
    drainTimer = null;
    const remaining = await countMutations();
    if (remaining > 0 && navigator.onLine) {
      await drainQueue();
    }
    // Re-schedule if still pending
    const after = await countMutations();
    if (after > 0) scheduleDrain(delayMs);
  }, delayMs);
}

let installed = false;
/** Wire up listeners — call once from main.tsx. */
export function installOfflineQueue(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("online", () => {
    drainQueue().catch((e) => console.error("[offline-queue] drain failed:", e));
  });

  // If there are pending items on startup, try to drain + set a periodic tick.
  countMutations().then((n) => {
    if (n > 0) {
      if (navigator.onLine) drainQueue().catch(() => { /* ignore */ });
      scheduleDrain();
    }
  });
}
