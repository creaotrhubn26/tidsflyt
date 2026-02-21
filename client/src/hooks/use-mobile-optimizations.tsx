import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export interface MobileOptimizationConfig {
  reduceAnimations: boolean;
  largerTouchTargets: boolean;
  optimizedFonts: boolean;
  mobileMenuCollapsed: boolean;
  compactViews: boolean;
}

export function useMobileOptimization(): MobileOptimizationConfig {
  const [config, setConfig] = useState<MobileOptimizationConfig>({
    reduceAnimations: false,
    largerTouchTargets: false,
    optimizedFonts: false,
    mobileMenuCollapsed: false,
    compactViews: false,
  });

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;

      setConfig((prev) => ({
        ...prev,
        reduceAnimations: mobile || window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        largerTouchTargets: mobile,
        optimizedFonts: mobile,
        mobileMenuCollapsed: mobile,
        compactViews: mobile,
      }));
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return config;
}

/**
 * Mobile-optimized card component with better touch targets
 */
export function MobileCard({
  children,
  onClick,
  className = "",
  interactive = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  interactive?: boolean;
}) {
  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`
          rounded-lg border bg-card text-card-foreground shadow-sm
          transition-all duration-300 active:scale-95 cursor-pointer
          ${className}
        `}
      >
        {children}
      </button>
    );
  }
  return (
    <div
      className={`
        rounded-lg border bg-card text-card-foreground shadow-sm
        transition-all duration-300
        ${className}
      `}
    >
      {children}
    </div>
  );
}

/**
 * Mobile-safe button with larger touch targets (minimum 44x44px)
 */
export function MobileTouchButton({
  children,
  onClick,
  variant = "default",
  disabled = false,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "outline" | "ghost" | "destructive";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      onClick={onClick}
      variant={variant}
      disabled={disabled}
      className={`
        h-11 px-4 text-base
        md:h-10 md:px-3 md:text-sm
        ${className}
      `}
    >
      {children}
    </Button>
  );
}

/**
 * Mobile drawer/modal backdrop for navigation
 */
export function MobileDrawerBackdrop({
  isOpen,
  onClose,
  children,
  position = "left",
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  position?: "left" | "right";
}) {
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
          role="presentation"
        />
      )}

      {/* Drawer */}
      <div
        className={`
          fixed top-0 ${position}-0 h-full w-64 bg-white dark:bg-slate-950 z-50
          transform transition-transform duration-300 ease-in-out
          md:hidden
          ${isOpen ? "translate-x-0" : (position === "left" ? "-translate-x-full" : "translate-x-full")}
        `}
      >
        <div className="p-4">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2"
            aria-label="Close drawer"
          >
            <X className="h-5 w-5" />
          </button>
          {children}
        </div>
      </div>
    </>
  );
}

/**
 * Mobile-optimized table view (stacked cards instead of table)
 */
export function MobileTableCard({
  header,
  children,
  onClick,
}: {
  header: string | React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        className="border rounded-lg p-4 mb-3 space-y-3 bg-card w-full text-left"
        onClick={onClick}
      >
        <div className="font-semibold text-base border-b pb-3">
          {header}
        </div>
        <div className="space-y-2 text-sm">
          {children}
        </div>
      </button>
    );
  }
  return (
    <div
      className="border rounded-lg p-4 mb-3 space-y-3 bg-card"
    >
      <div className="font-semibold text-base border-b pb-3">
        {header}
      </div>
      <div className="space-y-2 text-sm">
        {children}
      </div>
    </div>
  );
}

/**
 * Mobile view for data row (key-value pairs)
 */
export function MobileDataRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {icon && <div className="text-muted-foreground flex-shrink-0">{icon}</div>}
        <span className="text-muted-foreground text-sm">{label}</span>
      </div>
      <div className="font-medium text-right flex-shrink-0">
        {value}
      </div>
    </div>
  );
}

/**
 * Apply mobile-specific CSS for reduced motion
 */
export function useMobileAnimations() {
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      document.documentElement.style.setProperty("--animation-duration", "0ms");
    } else {
      document.documentElement.style.setProperty("--animation-duration", "300ms");
    }
  }, []);
}

/**
 * Responsive breakpoint hook
 */
export function useResponsiveBreakpoint() {
  const [breakpoint, setBreakpoint] = useState<"mobile" | "tablet" | "desktop">("desktop");

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 640) {
        setBreakpoint("mobile");
      } else if (width < 1024) {
        setBreakpoint("tablet");
      } else {
        setBreakpoint("desktop");
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return breakpoint;
}

/**
 * Safe area padding for notch/safe area support
 */
export function SafeAreaContainer({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`
        max-w-full
        md:max-w-7xl md:mx-auto
        safe-area-padding
        ${className}
      `}
    >
      {children}
    </div>
  );
}
