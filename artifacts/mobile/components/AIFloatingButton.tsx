import React, { useEffect, useRef } from "react";
import {
  Animated, Pressable, StyleSheet, View, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AIFloatingButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const ring1 = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse1, { toValue: 1.6, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse1, { toValue: 1, duration: 0, useNativeDriver: true }),
      ])
    );
    const ring2 = Animated.loop(
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(pulse2, { toValue: 1.9, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse2, { toValue: 1, duration: 0, useNativeDriver: true }),
      ])
    );
    const glowAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    );
    const spinAnim = Animated.loop(
      Animated.timing(rotate, { toValue: 1, duration: 8000, useNativeDriver: true })
    );
    ring1.start();
    ring2.start();
    glowAnim.start();
    spinAnim.start();
    return () => { ring1.stop(); ring2.stop(); glowAnim.stop(); spinAnim.stop(); };
  }, []);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }),
    ]).start();
    router.push("/ai-chat" as any);
  };

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });
  const ring1Opacity = pulse1.interpolate({ inputRange: [1, 1.6], outputRange: [0.5, 0] });
  const ring2Opacity = pulse2.interpolate({ inputRange: [1, 1.9], outputRange: [0.35, 0] });

  const bottom = Platform.OS === "web"
    ? 100
    : insets.bottom + 88;

  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      {/* Outer pulse rings */}
      <Animated.View style={[styles.ring, {
        transform: [{ scale: pulse2 }],
        opacity: ring2Opacity,
        backgroundColor: "#7c3aed",
      }]} />
      <Animated.View style={[styles.ring, {
        transform: [{ scale: pulse1 }],
        opacity: ring1Opacity,
        backgroundColor: "#a855f7",
      }]} />

      {/* Glow halo */}
      <Animated.View style={[styles.glow, { opacity: glowOpacity }]} />

      {/* Spinning ring accent */}
      <Animated.View style={[styles.spinRing, { transform: [{ rotate: spin }] }]}>
        <View style={styles.spinDot} />
      </Animated.View>

      {/* Main button */}
      <Pressable onPress={handlePress}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <LinearGradient
            colors={["#a855f7", "#7c3aed", "#4f46e5"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.btn}
          >
            <Feather name="zap" size={22} color="#fff" />
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const SIZE = 56;
const RING = SIZE + 16;

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 18,
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  ring: {
    position: "absolute",
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
  },
  glow: {
    position: "absolute",
    width: SIZE + 24,
    height: SIZE + 24,
    borderRadius: (SIZE + 24) / 2,
    backgroundColor: "#7c3aed",
  },
  spinRing: {
    position: "absolute",
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 1.5,
    borderColor: "#a855f7",
    borderStyle: "dashed",
    alignItems: "flex-start",
    justifyContent: "center",
  },
  spinDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#c084fc",
    marginLeft: -3,
  },
  btn: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#7c3aed",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 12,
  },
});
