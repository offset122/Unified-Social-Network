import React, { useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, Pressable, Animated, Modal, Dimensions, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";

const { height: H } = Dimensions.get("window");

interface Props {
  visible: boolean;
  onDismiss: () => void;
  reason?: string;
}

export default function AuthPromptModal({ visible, onDismiss, reason }: Props) {
  const router = useRouter();
  const translateY = useRef(new Animated.Value(H)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: H, duration: 250, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const go = (screen: "login" | "signup") => {
    onDismiss();
    setTimeout(() => {
      router.push({ pathname: "/login", params: { mode: screen } } as any);
    }, 250);
  };

  const perks = [
    { icon: "heart" as const, label: "Like & save posts" },
    { icon: "message-circle" as const, label: "Comment & message" },
    { icon: "plus-circle" as const, label: "Create posts & reels" },
    { icon: "bell" as const, label: "Get real-time notifications" },
  ];

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent onRequestClose={onDismiss}>
      <Animated.View style={[styles.overlay, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          {Platform.OS !== "web" ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(9,9,11,0.95)" }]} />
          )}

          <View style={styles.handle} />

          <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={styles.iconCircle}>
            <Feather name="zap" size={28} color="#fff" />
          </LinearGradient>

          <Text style={styles.title}>Join SocialApp</Text>
          <Text style={styles.subtitle}>
            {reason ?? "Create an account to unlock the full experience."}
          </Text>

          <View style={styles.perks}>
            {perks.map(p => (
              <View key={p.label} style={styles.perkRow}>
                <View style={styles.perkIcon}>
                  <Feather name={p.icon} size={15} color="#a78bfa" />
                </View>
                <Text style={styles.perkLabel}>{p.label}</Text>
              </View>
            ))}
          </View>

          <Pressable onPress={() => go("signup")} style={styles.primaryBtn}>
            <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={styles.primaryGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={styles.primaryBtnText}>Create Account — It's Free</Text>
            </LinearGradient>
          </Pressable>

          <Pressable onPress={() => go("login")} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>I already have an account</Text>
          </Pressable>

          <Pressable onPress={onDismiss} style={styles.dismissBtn}>
            <Text style={styles.dismissText}>Maybe Later</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 16,
    alignItems: "center",
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.12)",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginBottom: 20,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 6,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 12,
  },
  perks: {
    width: "100%",
    marginBottom: 24,
    gap: 10,
  },
  perkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  perkIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "rgba(167,139,250,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  perkLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontWeight: "500",
  },
  primaryBtn: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 10,
  },
  primaryGrad: {
    paddingVertical: 15,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryBtn: {
    width: "100%",
    paddingVertical: 13,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(167,139,250,0.4)",
    alignItems: "center",
    marginBottom: 10,
  },
  secondaryBtnText: {
    color: "#a78bfa",
    fontSize: 15,
    fontWeight: "700",
  },
  dismissBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  dismissText: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 14,
  },
});
