import { useToast } from "@/hooks/use-toast";
import { useCallback, useRef } from "react";
import type { ToastActionElement } from "@/components/ui/toast";

export type NotificationPriority = "info" | "success" | "warning" | "error" | "urgent";
export type NotificationCategory = "action" | "system" | "alert" | "reminder";

interface SmartNotification {
  title: string;
  description?: string;
  priority: NotificationPriority;
  category: NotificationCategory;
  action?: ToastActionElement;
  sound?: boolean;
  persistent?: boolean;
  timestamp: number;
}

interface NotificationStats {
  total: number;
  byCategory: Record<NotificationCategory, number>;
  byPriority: Record<NotificationPriority, number>;
  lastNotification: number;
}

const AUTO_DISMISS_DELAYS: Record<NotificationPriority, number> = {
  info: 3000,
  success: 3000,
  warning: 5000,
  error: 7000,
  urgent: 0, // Don't auto-dismiss
};

const VARIANT_MAP: Record<NotificationPriority, string> = {
  info: "default",
  success: "default",
  warning: "destructive",
  error: "destructive",
  urgent: "destructive",
};

export function useSmartNotifications() {
  const { toast } = useToast();
  const notificationHistoryRef = useRef<SmartNotification[]>([]);
  const statsRef = useRef<NotificationStats>({
    total: 0,
    byCategory: { action: 0, system: 0, alert: 0, reminder: 0 },
    byPriority: { info: 0, success: 0, warning: 0, error: 0, urgent: 0 },
    lastNotification: 0,
  });

  const playSound = useCallback((priority: NotificationPriority) => {
    if (typeof window === "undefined") return;

    // Create simple beep sounds based on priority
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    const frequencies: Record<NotificationPriority, number> = {
      info: 523.25, // C5
      success: 659.25, // E5
      warning: 783.99, // G5
      error: 392, // G4
      urgent: 349.23, // F4
    };

    const durations: Record<NotificationPriority, number> = {
      info: 100,
      success: 200,
      warning: 200,
      error: 300,
      urgent: 500,
    };

    oscillator.frequency.value = frequencies[priority];
    oscillator.type = priority === "urgent" ? "sawtooth" : "sine";

    gain.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + durations[priority] / 1000);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + durations[priority] / 1000);
  }, []);

  const notify = useCallback(
    (notification: Omit<SmartNotification, "timestamp">) => {
      const fullNotification: SmartNotification = {
        ...notification,
        timestamp: Date.now(),
      };

      // Update statistics
      statsRef.current.total++;
      statsRef.current.byCategory[notification.category]++;
      statsRef.current.byPriority[notification.priority]++;
      statsRef.current.lastNotification = Date.now();

      // Add to history
      notificationHistoryRef.current.push(fullNotification);
      if (notificationHistoryRef.current.length > 100) {
        notificationHistoryRef.current.shift();
      }

      // Play sound if enabled
      if (notification.sound && notification.priority === "urgent") {
        try {
          playSound(notification.priority);
        } catch (e) {
          console.debug("Audio context not available");
        }
      }

      // Calculate dismiss delay
      const dismissDelay = AUTO_DISMISS_DELAYS[notification.priority];

      // Show toast
      const toastPromise = toast({
        title: notification.title,
        description: notification.description,
        action: notification.action,
        variant: VARIANT_MAP[notification.priority] as any,
        duration: notification.persistent ? Infinity : dismissDelay,
      });

      return toastPromise;
    },
    [toast, playSound]
  );

  const success = useCallback(
    (title: string, description?: string) => {
      notify({
        title,
        description,
        priority: "success",
        category: "action",
      });
    },
    [notify]
  );

  const error = useCallback(
    (title: string, description?: string, action?: ToastActionElement) => {
      notify({
        title,
        description,
        priority: "error",
        category: "alert",
        action,
        sound: true,
      });
    },
    [notify]
  );

  const warning = useCallback(
    (title: string, description?: string) => {
      notify({
        title,
        description,
        priority: "warning",
        category: "alert",
      });
    },
    [notify]
  );

  const info = useCallback(
    (title: string, description?: string) => {
      notify({
        title,
        description,
        priority: "info",
        category: "system",
      });
    },
    [notify]
  );

  const urgent = useCallback(
    (title: string, description?: string, action?: ToastActionElement) => {
      notify({
        title,
        description,
        priority: "urgent",
        category: "alert",
        action,
        sound: true,
        persistent: true,
      });
    },
    [notify]
  );

  const reminder = useCallback(
    (title: string, description?: string) => {
      notify({
        title,
        description,
        priority: "info",
        category: "reminder",
      });
    },
    [notify]
  );

  const getStats = useCallback(() => {
    return { ...statsRef.current };
  }, []);

  const getHistory = useCallback((limit: number = 20) => {
    return notificationHistoryRef.current.slice(-limit);
  }, []);

  return {
    notify,
    success,
    error,
    warning,
    info,
    urgent,
    reminder,
    getStats,
    getHistory,
  };
}
