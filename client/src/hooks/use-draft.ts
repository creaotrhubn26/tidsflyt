import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SavedDraft<T> {
  formData: T;
  editingId: number | null;
  savedAt: string;
}

export interface UseDraftOptions<T extends Record<string, any>> {
  /** Unique localStorage key for this form type */
  storageKey: string;
  /** Current form data – the hook auto-saves whenever this changes */
  formData: T;
  /** Whether the form is currently visible (auto-save only runs when true) */
  isFormOpen: boolean;
  /** ID of the record being edited, if any */
  editingId?: number | null;
  /** Debounce interval for auto-save in ms (default: 1000) */
  debounceMs?: number;
  /** How many days before a draft expires (default: 7) */
  expirationDays?: number;
  /**
   * Predicate that decides whether the current form data has enough content
   * to be worth persisting. Return `false` to skip saving empty forms.
   * Defaults to always returning true.
   */
  hasContent?: (data: T) => boolean;
}

export interface UseDraftReturn<T> {
  /** Whether the "restore draft?" dialog should be shown */
  draftDialogOpen: boolean;
  /** The pending draft waiting for the user to accept or discard */
  pendingDraft: SavedDraft<T> | null;
  /**
   * Accept the pending draft.
   * Returns the saved data so the consumer can apply it to their own state.
   * Internally skips the next auto-save cycle to avoid re-persisting unchanged data.
   */
  restoreDraft: () => SavedDraft<T> | null;
  /** Discard the pending draft and clear storage */
  discardDraft: () => void;
  /** Clear draft from storage (call on successful submit / cancel) */
  clearDraft: () => void;
  /** Whether a debounced autosave is currently queued */
  isAutoSaving: boolean;
  /** Timestamp for the most recent saved draft */
  lastSavedAt: string | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDraft<T extends Record<string, any>>(
  options: UseDraftOptions<T>,
): UseDraftReturn<T> {
  const {
    storageKey,
    formData,
    isFormOpen,
    editingId = null,
    debounceMs = 1000,
    expirationDays = 7,
    hasContent = () => true,
  } = options;

  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<SavedDraft<T> | null>(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const skipNextSave = useRef(false);

  // ── Storage helpers ──────────────────────────────────────────────────────
  // Primary: server (cross-device persistence). Fallback: localStorage (offline).

  const save = useCallback(
    async (data: T, id: number | null) => {
      if (!hasContent(data)) {
        setIsAutoSaving(false);
        return;
      }
      const draft: SavedDraft<T> = {
        formData: data,
        editingId: id,
        savedAt: new Date().toISOString(),
      };
      // Local fallback (always write, even if server fails)
      try { localStorage.setItem(storageKey, JSON.stringify(draft)); } catch { /* quota */ }
      // Server upsert
      try {
        const expiresAt = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000).toISOString();
        await fetch(`/api/user-state/drafts/${encodeURIComponent(storageKey)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ payload: data, editingId: id, expiresAt }),
        });
      } catch { /* offline — local copy is the safety net */ }
      setLastSavedAt(draft.savedAt);
      setIsAutoSaving(false);
    },
    [storageKey, hasContent, expirationDays],
  );

  const load = useCallback(async (): Promise<SavedDraft<T> | null> => {
    // Try server first (latest cross-device draft), fall back to local
    try {
      const res = await fetch(`/api/user-state/drafts/${encodeURIComponent(storageKey)}`, { credentials: "include" });
      if (res.ok) {
        const row = await res.json();
        if (row?.payload) {
          return {
            formData: row.payload as T,
            editingId: row.editingId ?? null,
            savedAt: row.savedAt ?? new Date().toISOString(),
          };
        }
      }
    } catch { /* fall through to local */ }
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const draft = JSON.parse(raw) as SavedDraft<T>;
      const age = Date.now() - new Date(draft.savedAt).getTime();
      if (age > expirationDays * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(storageKey);
        return null;
      }
      return draft;
    } catch {
      localStorage.removeItem(storageKey);
      return null;
    }
  }, [storageKey, expirationDays]);

  const clear = useCallback(() => {
    localStorage.removeItem(storageKey);
    fetch(`/api/user-state/drafts/${encodeURIComponent(storageKey)}`, {
      method: "DELETE",
      credentials: "include",
    }).catch(() => { /* best-effort */ });
  }, [storageKey]);

  // ── Check for a saved draft on mount ────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    load().then(draft => {
      if (cancelled || !draft) return;
      setPendingDraft(draft);
      setDraftDialogOpen(true);
    });
    return () => { cancelled = true; };
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Debounced auto-save while the form is open ──────────────────────────

  useEffect(() => {
    if (!isFormOpen) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (!hasContent(formData)) {
      setIsAutoSaving(false);
      return;
    }
    setIsAutoSaving(true);
    const timer = setTimeout(() => {
      save(formData, editingId);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [formData, isFormOpen, editingId, debounceMs, save, hasContent]);

  // ── Public actions ──────────────────────────────────────────────────────

  const restoreDraft = useCallback((): SavedDraft<T> | null => {
    if (!pendingDraft) return null;
    skipNextSave.current = true;
    setDraftDialogOpen(false);
    setPendingDraft(null);
    setLastSavedAt(pendingDraft.savedAt);
    setIsAutoSaving(false);
    return pendingDraft;
  }, [pendingDraft]);

  const discardDraft = useCallback(() => {
    clear();
    setDraftDialogOpen(false);
    setPendingDraft(null);
    setIsAutoSaving(false);
    setLastSavedAt(null);
  }, [clear]);

  const clearDraft = useCallback(() => {
    clear();
    setIsAutoSaving(false);
    setLastSavedAt(null);
  }, [clear]);

  return {
    draftDialogOpen,
    pendingDraft,
    restoreDraft,
    discardDraft,
    clearDraft,
    isAutoSaving,
    lastSavedAt,
  };
}
