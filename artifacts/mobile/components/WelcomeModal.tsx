import React, { useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, Pressable, Animated, Dimensions, Modal, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import type { WelcomeState } from "@/lib/auth";

const { width: W, height: H } = Dimensions.get("window");

interface Props {
  visible: boolean;
  type: WelcomeState;
  firstName?: string | null;
  onDismiss: () => void;
}

function Particle({ delay, x, color }: { delay: number; x: number; color: string }) {
  const y = useRef(new Animated.Value(0)).current;
  const op = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(op, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(y, { toValue: -H * 0.4, duration: 2500, useNativeDriver: true }),
      ]),
      Animated.timing(op, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]);
    anim.start();
    const t = setInterval(() => { y.setValue(0); op.setValue(0); anim.start(); }, 3000 + delay);
    return () => clearInterval(t);
  }, []);

  return (
    <Animated.View style={[styles.particle, { left: x, transform: [{ translateY: y }], opacity: op, backgroundColor: color }]} />
  );
}

const PARTICLES = [
  { x: W * 0.1, color: "#a78bfa", delay: 0 },
  { x: W * 0.25, color: "#f472b6", delay: 200 },
  { x: W * 0.4, color: "#60a5fa", delay: 400 },
  { x: W * 0.55, color: "#34d399", delay: 150 },
  { x: W * 0.7, color: "#fbbf24", delay: 300 },
  { x: W * 0.85, color: "#f87171", delay: 100 },
  { x: W * 0.15, color: "#818cf8", delay: 500 },
  { x: W * 0.6, color: "#e879f9", delay: 250 },
];

export default function WelcomeModal({ visible, type, firstName, onDismiss }: Props) {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
      const t = setTimeout(onDismiss, 4500);
      return () => clearTimeout(t);
    } else {
      scale.setValue(0.7);
      opacity.setValue(0);
    }
  }, [visible]);

  if (!visible || !type) return null;

  const isWelcome = type === "welcome";
  const name = firstName ? `, ${firstName}` : "";
  const title = isWelcome ? `Welcome${name}! 🎉` : `Welcome back${name}! 👋`;
  const subtitle = isWelcome
    ? "You're all set! Your community is waiting."
    : "Great to see you again. Let's pick up where you left off.";

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <View style={styles.particlesContainer} pointerEvents="none">
          {PARTICLES.map((p, i) => <Particle key={i} x={p.x} color={p.color} delay={p.delay} />)}
        </View>

        <Animated.View style={[styles.card, { transform: [{ scale }], opacity }]}>
          <Pressable onPress={e => e.stopPropagation()}>
            {Platform.OS !== "web" ? (
              <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(15,10,30,0.92)" }]} />
            )}

            <LinearGradient
              colors={isWelcome ? ["#7c3aed", "#4f46e5", "#2563eb"] : ["#059669", "#0d9488", "#0891b2"]}
              style={styles.iconWrap}
            >
              <Text style={{ fontSize: 36 }}>{isWelcome ? "🎉" : "👋"}</Text>
            </LinearGradient>

            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>

            <View style={styles.featureRow}>
              {(isWelcome
                ? [["🏠", "Explore the feed"], ["🎬", "Watch reels"], ["💬", "Connect & chat"]]
                : [["🔔", "Catch up on notifications"], ["💬", "Check messages"], ["🏠", "See what's new"]]
              ).map(([icon, label]) => (
                <View key={label} style={styles.featurePill}>
                  <Text style={{ fontSize: 14 }}>{icon}</Text>
                  <Text style={styles.featureLabel}>{label}</Text>
                </View>
              ))}
            </View>

            <Pressable style={styles.btn} onPress={onDismiss}>
              <LinearGradient
                colors={isWelcome ? ["#7c3aed", "#4f46e5"] : ["#059669", "#0d9488"]}
                style={styles.btnGradient}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                <Text style={styles.btnText}>{isWelcome ? "Let's go!" : "Continue"}</Text>
                <Feather name="arrow-right" size={16} color="#fff" />
              </LinearGradient>
            </Pressable>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  particlesContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    paddingBottom: 0,
  },
  particle: {
    position: "absolute",
    bottom: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  card: {
    width: W * 0.88,
    borderRadius: 28,
    overflow: "hidden",
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  featureRow: {
    flexDirection: "column",
    gap: 8,
    width: "100%",
    marginBottom: 24,
  },
  featurePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  featureLabel: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    fontWeight: "600",
  },
  btn: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
  },
  btnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
  },
  btnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
});
