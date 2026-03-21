import { useEffect, useRef, type ReactNode } from "react";
import { ActivityIndicator } from "react-native";
import type { ToastShowOptions } from "@/components/toast-host";

const HISTORY_REFRESH_TOAST_DELAY_MS = 1000;
const HISTORY_REFRESH_TOAST_DURATION_MS = 2200;

interface UseDelayedHistoryRefreshToastParams {
  isCatchingUp: boolean;
  indicatorColor: string;
  showToast: (content: ReactNode, options?: ToastShowOptions) => void;
}

export function useDelayedHistoryRefreshToast({
  isCatchingUp,
  indicatorColor,
  showToast,
}: UseDelayedHistoryRefreshToastParams): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasCatchingUpRef = useRef(false);
  const isCatchingUpRef = useRef(false);
  const showToastRef = useRef(showToast);
  const indicatorColorRef = useRef(indicatorColor);

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useEffect(() => {
    indicatorColorRef.current = indicatorColor;
  }, [indicatorColor]);

  useEffect(() => {
    isCatchingUpRef.current = isCatchingUp;

    const enteredCatchUp = !wasCatchingUpRef.current && isCatchingUp;
    const exitedCatchUp = wasCatchingUpRef.current && !isCatchingUp;

    if (enteredCatchUp) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (!isCatchingUpRef.current) {
          return;
        }
        showToastRef.current("Refreshing", {
          icon: <ActivityIndicator size="small" color={indicatorColorRef.current} />,
          durationMs: HISTORY_REFRESH_TOAST_DURATION_MS,
          testID: "agent-history-refresh-toast",
        });
      }, HISTORY_REFRESH_TOAST_DELAY_MS);
    } else if (exitedCatchUp && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    wasCatchingUpRef.current = isCatchingUp;
  }, [isCatchingUp]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);
}
