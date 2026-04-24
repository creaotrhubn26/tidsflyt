/**
 * client/src/lib/offline-db.ts
 *
 * Thin IndexedDB wrapper for the offline mutation queue (Nivå B offline-first).
 *
 * One object store: `queue`.
 *   key: id (uuid, generated at enqueue time)
 *   shape: QueuedMutation
 *
 * Usage is async/promise-based. No external dep.
 */

export interface QueuedMutation {
  id: string;                // uuid — keypath
  url: string;               // full path incl. query string, e.g. "/api/logs"
  method: "POST" | "PATCH" | "DELETE" | "PUT";
  body: string | null;       // serialized JSON (null for DELETE)
  headers: Record<string, string>;
  createdAt: number;         // ms epoch
  attempts: number;
  lastError: string | null;
  lastAttemptAt: number | null;
}

const DB_NAME = "tidum-offline";
const DB_VERSION = 1;
const STORE = "queue";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function await_<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addMutation(m: QueuedMutation): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await await_(tx(db, "readwrite").add(m));
}

export async function listMutations(): Promise<QueuedMutation[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  // Ordered by the auto createdAt index; falls back to insertion order otherwise.
  const store = tx(db, "readonly");
  const idx = store.index("createdAt");
  const results: QueuedMutation[] = [];
  await new Promise<void>((resolve, reject) => {
    const req = idx.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        results.push(cursor.value as QueuedMutation);
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });
  return results;
}

export async function deleteMutation(id: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await await_(tx(db, "readwrite").delete(id));
}

export async function updateMutation(m: QueuedMutation): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await await_(tx(db, "readwrite").put(m));
}

export async function countMutations(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  const db = await openDb();
  return await_(tx(db, "readonly").count());
}

export async function clearMutations(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await await_(tx(db, "readwrite").clear());
}
