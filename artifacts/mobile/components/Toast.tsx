import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { RADIUS } from "@/constants/colors";
import { haptics, useReducedMotion } from "@/lib/motion";

export type ToastTone = "info" | "success" | "error";

interface ToastPayload {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useReducedMotion();

  const dismiss = useCallback(() => {
    if (reducedMotion) {
      opacity.setValue(0);
      setToast(null);
      return;
    }
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -70,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => setToast(null));
  }, [opacity, reducedMotion, translateY]);

  const showToast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (tone === "success") haptics.success();
      else if (tone === "error") haptics.error();
      else haptics.light();

      setToast({ id: Date.now(), message, tone });

      if (reducedMotion) {
        translateY.setValue(0);
        opacity.setValue(1);
      } else {
        translateY.setValue(-64);
        opacity.setValue(0);
        Animated.parallel([
          Animated.spring(translateY, {
            toValue: 0,
            damping: 22,
            stiffness: 260,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 160,
            useNativeDriver: true,
          }),
        ]).start();
      }

      timerRef.current = setTimeout(dismiss, 2800);
    },
    [dismiss, opacity, reducedMotion, translateY],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <ToastBanner
          toast={toast}
          translateY={translateY}
          opacity={opacity}
          onDismiss={dismiss}
        />
      )}
    </ToastContext.Provider>
  );
}

function ToastBanner({
  toast,
  translateY,
  opacity,
  onDismiss,
}: {
  toast: ToastPayload;
  translateY: Animated.Value;
  opacity: Animated.Value;
  onDismiss: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const iconName: keyof typeof Feather.glyphMap =
    toast.tone === "success"
      ? "check-circle"
      : toast.tone === "error"
      ? "alert-circle"
      : "info";

  const iconColor =
    toast.tone === "success"
      ? colors.semanticSuccess
      : toast.tone === "error"
      ? colors.semanticDanger
      : colors.accentPrimary;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { top: Math.max(insets.top + 8, 16) }]}
    >
      <Animated.View
        accessibilityLiveRegion="polite"
        style={[
          styles.banner,
          {
            backgroundColor: colors.bgMaterial,
            borderColor: colors.separator,
            transform: [{ translateY }],
            opacity,
          },
          Platform.OS === "web"
            ? ({
                backdropFilter: "saturate(180%) blur(20px)",
                WebkitBackdropFilter: "saturate(180%) blur(20px)",
              } as any)
            : null,
        ]}
      >
        <Pressable
          onPress={onDismiss}
          style={styles.inner}
          accessibilityRole="button"
          accessibilityLabel={toast.message}
        >
          <Feather name={iconName} size={18} color={iconColor} />
          <Text
            style={[styles.text, { color: colors.textPrimary }]}
            numberOfLines={2}
          >
            {toast.message}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
    zIndex: 2000,
  },
  banner: {
    maxWidth: 460,
    width: "100%",
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    ...(Platform.OS === "ios" ? { borderCurve: "continuous" as const } : {}),
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
});
