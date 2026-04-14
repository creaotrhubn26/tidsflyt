import { useCallback, useEffect, useRef, useState } from "react";

export interface BrregCompany {
  organisasjonsnummer: string;
  navn: string;
  hjemmeside?: string;
  forretningsadresse?: {
    adresse?: string[];
    postnummer?: string;
    poststed?: string;
  };
  organisasjonsform?: { kode?: string; beskrivelse?: string };
}

export interface BrregSearchState {
  results: BrregCompany[];
  loading: boolean;
  open: boolean;
  verified: boolean;
  search: (query: string) => void;
  setOpen: (open: boolean) => void;
  select: (company: BrregCompany) => BrregCompany;
  reset: () => void;
}

/**
 * Brønnøysund Enhetsregisteret search. Used when admin needs to look up an
 * org number or company name to pre-fill vendor details.
 *
 * - Debounced (300ms)
 * - If query matches 9 digits → direct org-nr lookup (single result)
 * - Otherwise → name search, top 5 matches
 */
export function useBrregSearch(debounceMs = 300): BrregSearchState {
  const [results, setResults] = useState<BrregCompany[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [verified, setVerified] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController>();

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
  }, []);

  const search = useCallback((query: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();

    const cleaned = query.trim();
    if (cleaned.length < 3) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const isOrgNumber = /^\d{9}$/.test(cleaned.replace(/\s/g, ""));
        const url = isOrgNumber
          ? `https://data.brreg.no/enhetsregisteret/api/enheter/${cleaned.replace(/\s/g, "")}`
          : `https://data.brreg.no/enhetsregisteret/api/enheter?navn=${encodeURIComponent(cleaned)}&size=5`;

        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) {
          if (!ctrl.signal.aborted) { setResults([]); setOpen(false); }
          return;
        }
        const data = await res.json();
        if (ctrl.signal.aborted) return;
        if (isOrgNumber) {
          setResults([data]);
          setOpen(true);
        } else if (data._embedded?.enheter) {
          setResults(data._embedded.enheter);
          setOpen(true);
        } else {
          setResults([]);
          setOpen(false);
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error("Brreg search error:", err);
          setResults([]);
          setOpen(false);
        }
      } finally {
        if (!abortRef.current?.signal.aborted) setLoading(false);
      }
    }, debounceMs);
  }, [debounceMs]);

  const select = useCallback((company: BrregCompany) => {
    setVerified(true);
    setOpen(false);
    setResults([]);
    return company;
  }, []);

  const reset = useCallback(() => {
    setResults([]);
    setOpen(false);
    setVerified(false);
    setLoading(false);
  }, []);

  return { results, loading, open, verified, search, setOpen, select, reset };
}
