import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  icon: "plus-circle" | "message-square" | "user" | "radio";
  title: string;
  subtitle: string;
  perks: string[];
}

export default function GuestScreen({ icon, title, subtitle, perks }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient colors={["#09090b", "#1a0533"]} style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <View style={styles.content}>
        <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={styles.iconCircle}>
          <Feather name={icon} size={36} color="#fff" />
        </LinearGradient>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.perksCard}>
          {perks.map((perk, i) => (
            <View key={i} style={styles.perkRow}>
              <View style={styles.dot} />
              <Text style={styles.perkText}>{perk}</Text>
            </View>
          ))}
        </View>

        <Pressable onPress={() => router.push("/login" as any)} style={styles.primaryBtn}>
          <LinearGradient
            colors={["#7c3aed", "#4f46e5"]}
            style={styles.primaryGrad}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          >
            <Feather name="user-plus" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Create Free Account</Text>
          </LinearGradient>
        </Pressable>

        <Pressable
          onPress={() => router.push({ pathname: "/login", params: { mode: "login" } } as any)}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryBtnText}>Sign In</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    shadowColor: "#7c3aed",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  perksCard: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 20,
    gap: 12,
    marginBottom: 28,
  },
  perkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#7c3aed",
  },
  perkText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontWeight: "500",
  },
  primaryBtn: {
    width: "100%",
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 12,
    shadowColor: "#7c3aed",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(124,58,237,0.4)",
    width: "100%",
    alignItems: "center",
  },
  secondaryBtnText: {
    color: "#a78bfa",
    fontSize: 16,
    fontWeight: "700",
  },
});
