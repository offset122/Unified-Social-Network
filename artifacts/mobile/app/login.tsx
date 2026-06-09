import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  ActivityIndicator,
  Platform,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth";
import { useColorScheme } from "react-native";

const { width, height } = Dimensions.get("window");

const FEATURES = [
  { icon: "home" as const,       label: "Share Moments",   desc: "Post photos, stories & updates" },
  { icon: "message-circle" as const, label: "Real-time Chat", desc: "DMs, groups & channels" },
  { icon: "users" as const,      label: "Build Community",  desc: "Create groups & stay connected" },
  { icon: "rss" as const,        label: "Follow Channels",  desc: "Curated content you love" },
];

type Screen = "welcome" | "action";

function Blob({
  style,
  colors: blobColors,
}: {
  style?: object;
  colors: [string, string];
}) {
  return (
    <LinearGradient colors={blobColors} style={[styles.blob, style]} />
  );
}

export default function LoginScreen() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const [screen, setScreen] = useState<Screen>("welcome");
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const isWeb = Platform.OS === "web";
  const fadeAnim = useRef(new Animated.Value(isWeb ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(isWeb ? 0 : 30)).current;
  const logoScale = useRef(new Animated.Value(isWeb ? 1 : 0.8)).current;
  const logoRotate = useRef(new Animated.Value(isWeb ? 1 : 0)).current;
  const featureAnims = useRef(FEATURES.map(() => new Animated.Value(isWeb ? 1 : 0))).current;
  const screenFade = useRef(new Animated.Value(1)).current;

  const ND = !isWeb;

  useEffect(() => {
    if (isWeb) return;
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(logoRotate, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start(() => {
      Animated.stagger(
        100,
        featureAnims.map((a) =>
          Animated.spring(a, { toValue: 1, tension: 70, friction: 10, useNativeDriver: true }),
        ),
      ).start();
    });
  }, []);

  const handleGoToAction = () => {
    Animated.timing(screenFade, { toValue: 0, duration: 200, useNativeDriver: ND }).start(() => {
      setScreen("action");
      Animated.timing(screenFade, { toValue: 1, duration: 300, useNativeDriver: ND }).start();
    });
  };

  const handleBack = () => {
    Animated.timing(screenFade, { toValue: 0, duration: 200, useNativeDriver: ND }).start(() => {
      setScreen("welcome");
      Animated.timing(screenFade, { toValue: 1, duration: 300, useNativeDriver: ND }).start();
    });
  };

  const handleAuth = async () => {
    setIsAuthenticating(true);
    try {
      await login();
    } finally {
      setIsAuthenticating(false);
    }
  };

  if (!isLoading && isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  const spinInterpolate = logoRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["-15deg", "0deg"],
  });

  const bg: [string, string] = isDark
    ? ["#09090b", "#1a0533"]
    : ["#f5f3ff", "#ede9fe"];
  const blobA: [string, string] = isDark
    ? ["#4c1d95", "#6d28d9"]
    : ["#c4b5fd", "#8b5cf6"];
  const blobB: [string, string] = isDark
    ? ["#1e1b4b", "#312e81"]
    : ["#ddd6fe", "#a78bfa"];

  const primaryColor = isDark ? "#8b5cf6" : "#6d28d9";
  const fg = isDark ? "#fafafa" : "#09090b";
  const fgMuted = isDark ? "#a1a1aa" : "#71717a";
  const cardBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(109,40,217,0.06)";
  const cardBorder = isDark ? "rgba(255,255,255,0.1)" : "rgba(109,40,217,0.15)";

  return (
    <View style={styles.root}>
      <LinearGradient colors={bg} style={StyleSheet.absoluteFill} />
      <Blob colors={blobA} style={{ top: -80, right: -60, width: 260, height: 260, borderRadius: 130 }} />
      <Blob colors={blobB} style={{ bottom: 120, left: -80, width: 300, height: 300, borderRadius: 150 }} />
      <Blob colors={blobA} style={{ top: height * 0.4, right: -40, width: 160, height: 160, borderRadius: 80, opacity: 0.5 }} />

      <SafeAreaView style={styles.safe}>
        <Animated.View style={[styles.inner, { opacity: screenFade }]}>

          {screen === "welcome" ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
              <Animated.View
                style={[
                  styles.logoWrap,
                  {
                    opacity: fadeAnim,
                    transform: [{ scale: logoScale }, { rotate: spinInterpolate }],
                  },
                ]}
              >
                <LinearGradient
                  colors={["#7c3aed", "#4f46e5"]}
                  style={styles.logoGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={styles.logoLetter}>S</Text>
                </LinearGradient>
              </Animated.View>

              <Animated.View style={[styles.headingBlock, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                <Text style={[styles.appName, { color: fg }]}>SocialApp</Text>
                <Text style={[styles.tagline, { color: fgMuted }]}>
                  Your world, connected.
                </Text>
              </Animated.View>

              <View style={styles.features}>
                {FEATURES.map((f, i) => (
                  <Animated.View
                    key={f.label}
                    style={[
                      styles.featureCard,
                      { backgroundColor: cardBg, borderColor: cardBorder },
                      {
                        opacity: featureAnims[i],
                        transform: [
                          {
                            translateY: featureAnims[i].interpolate({
                              inputRange: [0, 1],
                              outputRange: [20, 0],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <View style={[styles.featureIconWrap, { backgroundColor: primaryColor + "22" }]}>
                      <Feather name={f.icon} size={18} color={primaryColor} />
                    </View>
                    <View style={styles.featureText}>
                      <Text style={[styles.featureLabel, { color: fg }]}>{f.label}</Text>
                      <Text style={[styles.featureDesc, { color: fgMuted }]}>{f.desc}</Text>
                    </View>
                  </Animated.View>
                ))}
              </View>

              <Animated.View style={[styles.ctas, { opacity: fadeAnim }]}>
                <Pressable
                  style={({ pressed }) => [
                    styles.btn,
                    styles.btnPrimary,
                    { backgroundColor: primaryColor, opacity: pressed ? 0.85 : 1 },
                  ]}
                  onPress={handleGoToAction}
                >
                  <Text style={[styles.btnText, styles.btnTextPrimary]}>Get Started</Text>
                  <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
                </Pressable>
              </Animated.View>
            </ScrollView>
          ) : (
            <>
              <Pressable style={styles.backBtn} onPress={handleBack}>
                <View style={[styles.backCircle, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                  <Feather name="arrow-left" size={20} color={fg} />
                </View>
              </Pressable>

              <View style={styles.actionTop}>
                <LinearGradient
                  colors={["#7c3aed", "#4f46e5"]}
                  style={styles.logoGradSmall}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={styles.logoLetterSmall}>S</Text>
                </LinearGradient>
                <Text style={[styles.actionTitle, { color: fg }]}>Welcome</Text>
                <Text style={[styles.actionSubtitle, { color: fgMuted }]}>
                  Sign up or log in to continue{"\n"}to SocialApp
                </Text>
              </View>

              <View style={styles.actionCards}>
                <Pressable
                  style={({ pressed }) => [
                    styles.authCard,
                    { backgroundColor: cardBg, borderColor: cardBorder, opacity: pressed ? 0.8 : 1 },
                  ]}
                  onPress={handleAuth}
                  disabled={isAuthenticating || isLoading}
                >
                  <View style={[styles.authCardIcon, { backgroundColor: primaryColor + "22" }]}>
                    <Feather name="user-plus" size={22} color={primaryColor} />
                  </View>
                  <View style={styles.authCardText}>
                    <Text style={[styles.authCardTitle, { color: fg }]}>Create an Account</Text>
                    <Text style={[styles.authCardDesc, { color: fgMuted }]}>New here? Join millions of users</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={fgMuted} />
                </Pressable>

                <View style={[styles.dividerRow]}>
                  <View style={[styles.dividerLine, { backgroundColor: cardBorder }]} />
                  <Text style={[styles.dividerText, { color: fgMuted }]}>or</Text>
                  <View style={[styles.dividerLine, { backgroundColor: cardBorder }]} />
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.authCard,
                    { backgroundColor: cardBg, borderColor: cardBorder, opacity: pressed ? 0.8 : 1 },
                  ]}
                  onPress={handleAuth}
                  disabled={isAuthenticating || isLoading}
                >
                  <View style={[styles.authCardIcon, { backgroundColor: primaryColor + "22" }]}>
                    <Feather name="log-in" size={22} color={primaryColor} />
                  </View>
                  <View style={styles.authCardText}>
                    <Text style={[styles.authCardTitle, { color: fg }]}>Log In</Text>
                    <Text style={[styles.authCardDesc, { color: fgMuted }]}>Welcome back, continue your journey</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={fgMuted} />
                </Pressable>
              </View>

              <Text style={[styles.legal, { color: fgMuted }]}>
                By continuing you agree to our{" "}
                <Text style={{ color: primaryColor }}>Terms of Service</Text>
                {" "}and{" "}
                <Text style={{ color: primaryColor }}>Privacy Policy</Text>
              </Text>
            </>
          )}
        </Animated.View>
      </SafeAreaView>

      {(isAuthenticating || (isLoading && isAuthenticated === false && screen === "action")) && (
        <View style={styles.loadingOverlay}>
          {Platform.OS === "ios" ? (
            <BlurView intensity={60} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(9,9,11,0.7)" : "rgba(255,255,255,0.7)" }]} />
          )}
          <View style={[styles.loadingCard, { backgroundColor: isDark ? "#1c1c1e" : "#ffffff" }]}>
            <ActivityIndicator size="large" color={primaryColor} />
            <Text style={[styles.loadingText, { color: fg }]}>Opening secure sign-in…</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },

  blob: { position: "absolute", opacity: 0.35 },

  logoWrap: { alignItems: "center", marginTop: 24, marginBottom: 20 },
  logoGrad: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 16, elevation: 12,
  },
  logoLetter: { fontSize: 40, fontWeight: "800", color: "#fff", lineHeight: 48 },

  headingBlock: { alignItems: "center", marginBottom: 32 },
  appName: { fontSize: 36, fontWeight: "800", letterSpacing: -1, marginBottom: 6 },
  tagline: { fontSize: 17, letterSpacing: 0.2, textAlign: "center" },

  features: { gap: 10, marginBottom: 32 },
  featureCard: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 16, borderWidth: 1,
    paddingVertical: 14, paddingHorizontal: 16,
  },
  featureIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center", marginRight: 14,
  },
  featureText: { flex: 1 },
  featureLabel: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
  featureDesc: { fontSize: 13 },

  ctas: { gap: 12 },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 16, paddingVertical: 16,
  },
  btnPrimary: {
    shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  btnText: { fontSize: 17, fontWeight: "700" },
  btnTextPrimary: { color: "#fff" },

  backBtn: { marginBottom: 20, alignSelf: "flex-start" },
  backCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },

  actionTop: { alignItems: "center", marginBottom: 40 },
  logoGradSmall: {
    width: 56, height: 56, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    marginBottom: 20,
    shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  logoLetterSmall: { fontSize: 28, fontWeight: "800", color: "#fff", lineHeight: 34 },
  actionTitle: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5, marginBottom: 8 },
  actionSubtitle: { fontSize: 16, textAlign: "center", lineHeight: 24 },

  actionCards: { gap: 0 },
  authCard: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 18, borderWidth: 1,
    paddingVertical: 18, paddingHorizontal: 18, marginBottom: 0,
  },
  authCardIcon: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: "center", justifyContent: "center", marginRight: 14,
  },
  authCardText: { flex: 1 },
  authCardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 2 },
  authCardDesc: { fontSize: 13 },

  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 16, paddingHorizontal: 8 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13, marginHorizontal: 12 },

  legal: { fontSize: 12, textAlign: "center", lineHeight: 18, marginTop: "auto", paddingTop: 24 },

  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", zIndex: 100 },
  loadingCard: {
    borderRadius: 20, paddingVertical: 32, paddingHorizontal: 40,
    alignItems: "center", gap: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
  },
  loadingText: { fontSize: 15, fontWeight: "500" },
});
