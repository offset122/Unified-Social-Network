import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "react-native";
import VibeLogo from "@/components/VibeLogo";

const { width, height } = Dimensions.get("window");

export default function SplashScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={isDark ? ["#0f172a", "#1e1b4b", "#312e81"] : ["#eef2ff", "#e0e7ff", "#c7d2fe"]}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        style={[
          styles.content,
          {
            opacity,
            transform: [{ scale }],
          },
        ]}
      >
        <VibeLogo size={96} showText={true} />
        <Text style={[styles.loading, { color: isDark ? "#94a3b8" : "#64748b" }]}>
          Loading your vibe...
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
    gap: 24,
  },
  loading: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
