import { useState, useRef, useCallback } from "react";

export interface AktivitetForslag {
  tekst: string;
  type?: string;
  sted?: string;
  kilde: "historikk" | "ai";
}

/**
 * Debounced hook that fetches activity suggestions as the user types.
 * Returns prefix-matched history + AI-generated completions.
 */
export function useAktivitetForslag() {
  const [forslag, setForslag] = useState<AktivitetForslag[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController>();

  const hent = useCallback((tekst: string, type?: string, sted?: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!tekst || tekst.length < 2) {
      setForslag([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch("/api/rapporter/aktivitet-forslag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tekst, type, sted }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!ctrl.signal.aborted) {
          setForslag(data.forslag ?? []);
        }
      } catch {
        if (!ctrl.signal.aborted) setForslag([]);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 300);
  }, []);

  const nullstill = useCallback(() => {
    setForslag([]);
    setLoading(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  return { forslag, loading, hent, nullstill };
}
