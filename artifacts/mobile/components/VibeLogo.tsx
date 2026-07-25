import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "react-native";

export default function VibeLogo({ size = 48, showText = true }: { size?: number; showText?: boolean }) {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const wordmarkColor = isDark ? "#f8fafc" : "#0f172a";

  return (
    <View style={[styles.row, { gap: 10 }]}>
      <LinearGradient
        colors={["#6366f1", "#8b5cf6", "#a855f7"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.iconWrap,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        <View style={styles.iconInner}>
          <Text style={[styles.iconText, { fontSize: size * 0.42 }]}>V</Text>
        </View>
      </LinearGradient>
      {showText && (
        <View style={{ justifyContent: "center" }}>
          <Text style={[styles.wordmark, { fontSize: size * 0.55, color: wordmarkColor }]}>Vibe</Text>
          <Text style={[styles.tagline, { fontSize: size * 0.22 }]}>your moment</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  iconInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    color: "#fff",
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  wordmark: {
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  tagline: {
    fontWeight: "600",
    color: "#6366f1",
    letterSpacing: 1.5,
    textTransform: "lowercase",
  },
});
