import { useEffect, useRef, useState, useCallback } from "react";

interface GestureHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onDoubleTap?: () => void;
  onLongPress?: () => void;
}

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
  x: number;
  y: number;
}

/**
 * Hook for handling swipe gestures on mobile
 */
export function useSwipeGesture(
  handlers: GestureHandlers,
  options: { threshold?: number; longPressDuration?: number } = {}
) {
  const threshold = options.threshold ?? 50;
  const longPressDuration = options.longPressDuration ?? 500;

  const touchState = useRef<TouchState | null>(null);
  const lastTapRef = useRef<number>(0);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    touchState.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      x: touch.clientX,
      y: touch.clientY,
    };

    // Setup long press
    if (handlers.onLongPress) {
      longPressTimerRef.current = setTimeout(() => {
        handlers.onLongPress?.();
      }, longPressDuration);
    }
  }, [handlers, longPressDuration]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!touchState.current) return;
    const touch = e.touches[0];
    touchState.current.x = touch.clientX;
    touchState.current.y = touch.clientY;

    // Cancel long press on significant movement
    if (longPressTimerRef.current) {
      const dx = Math.abs(touch.clientX - touchState.current.startX);
      const dy = Math.abs(touch.clientY - touchState.current.startY);
      if (dx > 10 || dy > 10) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchState.current) return;

    // Clear long press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    const dx = touchState.current.x - touchState.current.startX;
    const dy = touchState.current.y - touchState.current.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const time = Date.now() - touchState.current.startTime;

    // Check for double tap
    const now = Date.now();
    if (time < 300 && distance < 10 && now - lastTapRef.current < 300) {
      handlers.onDoubleTap?.();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }

    // Check for swipes
    if (distance > threshold && time < 300) {
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) {
          handlers.onSwipeRight?.();
        } else {
          handlers.onSwipeLeft?.();
        }
      } else {
        if (dy > 0) {
          handlers.onSwipeDown?.();
        } else {
          handlers.onSwipeUp?.();
        }
      }
    }

    touchState.current = null;
  }, [handlers, threshold]);

  return { handleTouchStart, handleTouchMove, handleTouchEnd };
}

/**
 * Hook to detect if the device is mobile
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;

    // Check by screen width
    if (window.innerWidth < 768) return true;

    // Check user agent
    const userAgent = navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod|android|blackberry|windows phone/.test(userAgent);
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return isMobile;
}

/**
 * Hook for handling viewport changes and safe areas
 */
export function useViewportHeight() {
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const handleResize = () => {
      // Use innerHeight instead of window.visualViewport to account for address bar
      setViewportHeight(window.innerHeight);

      // Set CSS variable for use in stylesheets
      document.documentElement.style.setProperty("--viewport-height", `${window.innerHeight}px`);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  return viewportHeight;
}

/**
 * Hook to handle keyboard visibility on mobile
 */
export function useKeyboardVisible() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleFocus = () => setIsKeyboardVisible(true);
    const handleBlur = () => setIsKeyboardVisible(false);

    // Listen on all input elements
    const inputs = document.querySelectorAll("input, textarea");
    inputs.forEach((input) => {
      input.addEventListener("focus", handleFocus);
      input.addEventListener("blur", handleBlur);
    });

    return () => {
      inputs.forEach((input) => {
        input.removeEventListener("focus", handleFocus);
        input.removeEventListener("blur", handleBlur);
      });
    };
  }, []);

  return isKeyboardVisible;
}

/**
 * Touch-friendly tooltip for mobile
 */
export function useTouchTooltip() {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const tooltipTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showTooltip = useCallback((x: number, y: number, text: string) => {
    setTooltip({ x, y, text });
  }, []);

  const hideTooltip = useCallback(() => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
    }
    setTooltip(null);
  }, []);

  const handleLongPress = useCallback(
    (event: React.TouchEvent, text: string) => {
      const touch = event.touches[0];
      showTooltip(touch.clientX, touch.clientY, text);

      // Auto-hide after 3 seconds
      tooltipTimerRef.current = setTimeout(() => {
        hideTooltip();
      }, 3000);
    },
    [showTooltip, hideTooltip]
  );

  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
      }
    };
  }, []);

  return { tooltip, handleLongPress, hideTooltip };
}

/**
 * Prevent zoom on double tap (useful for custom interactions)
 */
export function usePreventDoubleClickZoom() {
  useEffect(() => {
    let lastTouchEnd = 0;

    const preventZoom = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    };

    document.addEventListener("touchend", preventZoom, false);
    return () => document.removeEventListener("touchend", preventZoom, false);
  }, []);
}

/**
 * Handle haptic feedback on mobile devices
 */
export function useHapticFeedback() {
  const trigger = useCallback((pattern: "light" | "medium" | "heavy" = "medium") => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      const patterns = {
        light: 10,
        medium: 30,
        heavy: 50,
      };
      navigator.vibrate(patterns[pattern]);
    }
  }, []);

  return trigger;
}

/**
 * Optimize images for mobile displaying
 */
export function useResponsiveImage(src: string) {
  const [imageSrc, setImageSrc] = useState(src);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isMobile) {
      // For mobile, you could serve a lower resolution or optimized version
      // This is a placeholder for actual image optimization logic
      setImageSrc(src);
    } else {
      setImageSrc(src);
    }
  }, [src, isMobile]);

  return imageSrc;
}
