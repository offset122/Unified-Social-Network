import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import * as Haptics from "expo-haptics";

export const SPRING_SNAPPY = {
  damping: 22,
  stiffness: 260,
  mass: 1,
} as const;

export const SPRING_GENTLE = {
  damping: 26,
  stiffness: 190,
  mass: 1,
} as const;

export const SPRING_HEART = {
  damping: 12,
  stiffness: 320,
  mass: 0.9,
} as const;

export const TIMING_FAST = 180;
export const TIMING_SHEET = 240;

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduced(!!enabled);
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        setReduced(!!enabled);
      },
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}

const canHaptic = Platform.OS === "ios" || Platform.OS === "android";

export const haptics = {
  selection() {
    if (!canHaptic) return;
    Haptics.selectionAsync().catch(() => {});
  },
  light() {
    if (!canHaptic) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  medium() {
    if (!canHaptic) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  success() {
    if (!canHaptic) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  error() {
    if (!canHaptic) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
  warning() {
    if (!canHaptic) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
};
