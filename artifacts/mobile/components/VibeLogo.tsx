import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";

export default function VibeLogo({
  size = 48,
  showText = true,
  showTagline,
}: {
  size?: number;
  showText?: boolean;
  showTagline?: boolean;
}) {
  const colors = useColors();
  const displayTagline = showTagline ?? size >= 64;

  return (
    <View style={[styles.row, { gap: Math.max(8, Math.round(size * 0.25)) }]}>
      <LinearGradient
        colors={["#6D28D9", "#8B5CF6", "#A855F7"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.iconWrap,
          {
            width: size,
            height: size,
            borderRadius: Math.round(size * 0.34),
          },
        ]}
      >
        <Text style={[styles.iconText, { fontSize: size * 0.44 }]}>V</Text>
      </LinearGradient>
      {showText && (
        <View style={{ justifyContent: "center" }}>
          <Text
            style={[
              styles.wordmark,
              { fontSize: Math.max(18, Math.round(size * 0.58)), color: colors.textPrimary },
            ]}
            numberOfLines={1}
          >
            Vibe
          </Text>
          {displayTagline && (
            <Text style={[styles.tagline, { fontSize: size * 0.2, color: colors.accentPrimary }]}>
              your moment
            </Text>
          )}
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
    shadowColor: "#6D28D9",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 4,
  },
  iconText: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  wordmark: {
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  tagline: {
    fontWeight: "600",
    letterSpacing: 1.4,
    textTransform: "lowercase",
    marginTop: 1,
  },
});
