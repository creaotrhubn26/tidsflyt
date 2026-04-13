/**
 * Global compose context — allows opening the email compose modal from anywhere.
 *
 * Usage:
 *   const { openCompose } = useCompose();
 *   openCompose({ to: "user@example.com", subject: "Hei" });
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface ComposeDefaults {
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  templateId?: number;
  recipientName?: string;
}

interface ComposeContextValue {
  isOpen: boolean;
  isMinimized: boolean;
  defaults: ComposeDefaults;
  openCompose: (defaults?: ComposeDefaults) => void;
  minimize: () => void;
  restore: () => void;
  close: () => void;
}

const ComposeContext = createContext<ComposeContextValue | null>(null);

export function ComposeProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [defaults, setDefaults] = useState<ComposeDefaults>({});

  const openCompose = useCallback((d?: ComposeDefaults) => {
    setDefaults(d ?? {});
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

  const minimize = useCallback(() => setIsMinimized(true), []);
  const restore = useCallback(() => setIsMinimized(false), []);
  const close = useCallback(() => { setIsOpen(false); setIsMinimized(false); setDefaults({}); }, []);

  return (
    <ComposeContext.Provider value={{ isOpen, isMinimized, defaults, openCompose, minimize, restore, close }}>
      {children}
    </ComposeContext.Provider>
  );
}

export function useCompose() {
  const ctx = useContext(ComposeContext);
  if (!ctx) throw new Error("useCompose must be used inside ComposeProvider");
  return ctx;
}
