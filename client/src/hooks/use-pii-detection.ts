import { useState, useCallback, useRef, useEffect } from 'react';
import { scanMultipleFields, type PiiScanResult } from '@/lib/pii-detector';

interface UsePiiDetectionOptions {
  /** Enable/disable scanning (default: true) */
  enabled?: boolean;
  /** Debounce delay in ms (default: 500) */
  debounceMs?: number;
}

interface UsePiiDetectionResult {
  /** Per-field scan results */
  fieldResults: Record<string, PiiScanResult>;
  /** Total number of warnings across all fields */
  totalWarnings: number;
  /** Whether any PII was detected */
  hasPii: boolean;
  /** Trigger a scan of the provided fields */
  scanFields: (fields: Record<string, string>) => void;
  /** Whether a scan is currently pending (debounced) */
  isPending: boolean;
  /** Clear all results */
  clearResults: () => void;
}

/**
 * React hook for real-time PII detection in form fields.
 * Debounces scanning to avoid excessive computation while typing.
 */
export function usePiiDetection(options: UsePiiDetectionOptions = {}): UsePiiDetectionResult {
  const { enabled = true, debounceMs = 500 } = options;
  
  const [fieldResults, setFieldResults] = useState<Record<string, PiiScanResult>>({});
  const [totalWarnings, setTotalWarnings] = useState(0);
  const [hasPii, setHasPii] = useState(false);
  const [isPending, setIsPending] = useState(false);
  
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFieldsRef = useRef<Record<string, string>>({});

  const clearResults = useCallback(() => {
    setFieldResults({});
    setTotalWarnings(0);
    setHasPii(false);
    setIsPending(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scanFields = useCallback((fields: Record<string, string>) => {
    if (!enabled) return;

    lastFieldsRef.current = fields;
    setIsPending(true);

    // Clear existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Debounce the scan
    timerRef.current = setTimeout(() => {
      const { results, totalWarnings: total, hasPii: detected } = scanMultipleFields(fields);
      setFieldResults(results);
      setTotalWarnings(total);
      setHasPii(detected);
      setIsPending(false);
    }, debounceMs);
  }, [enabled, debounceMs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    fieldResults,
    totalWarnings,
    hasPii,
    scanFields,
    isPending,
    clearResults,
  };
}
