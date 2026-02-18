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
  const skipNextSave = useRef(false);

  // ── Storage helpers (stable across renders via storageKey) ───────────────

  const save = useCallback(
    (data: T, id: number | null) => {
      if (!hasContent(data)) return;
      try {
        const draft: SavedDraft<T> = {
          formData: data,
          editingId: id,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(storageKey, JSON.stringify(draft));
      } catch {
        /* quota exceeded – ignore */
      }
    },
    [storageKey, hasContent],
  );

  const load = useCallback((): SavedDraft<T> | null => {
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
  }, [storageKey]);

  // ── Check for a saved draft on mount ────────────────────────────────────

  useEffect(() => {
    const draft = load();
    if (draft) {
      setPendingDraft(draft);
      setDraftDialogOpen(true);
    }
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
    const timer = setTimeout(() => {
      save(formData, editingId);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [formData, isFormOpen, editingId, debounceMs, save]);

  // ── Public actions ──────────────────────────────────────────────────────

  const restoreDraft = useCallback((): SavedDraft<T> | null => {
    if (!pendingDraft) return null;
    skipNextSave.current = true;
    setDraftDialogOpen(false);
    setPendingDraft(null);
    return pendingDraft;
  }, [pendingDraft]);

  const discardDraft = useCallback(() => {
    clear();
    setDraftDialogOpen(false);
    setPendingDraft(null);
  }, [clear]);

  const clearDraft = useCallback(() => {
    clear();
  }, [clear]);

  return {
    draftDialogOpen,
    pendingDraft,
    restoreDraft,
    discardDraft,
    clearDraft,
  };
}
