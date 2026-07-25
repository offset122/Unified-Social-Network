import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/lib/auth";
import { useColorScheme } from "react-native";
import VibeLogo from "@/components/VibeLogo";

const { width, height } = Dimensions.get("window");

type Screen = "welcome" | "login-form" | "signup-form";

function buildColors(isDark: boolean) {
  return {
    bg: isDark
      ? (["#050508", "#0d0520", "#130a2e"] as [string, string, string])
      : (["#f8f5ff", "#ede8ff", "#e0d7ff"] as [string, string, string]),
    gradientAccent: isDark
      ? (["#7c3aed", "#4f46e5"] as [string, string])
      : (["#7c3aed", "#4f46e5"] as [string, string]),
    primary: "#7c3aed",
    primaryLight: isDark ? "#a78bfa" : "#8b5cf6",
    secondary: "#4f46e5",
    fg: isDark ? "#fafafa" : "#0f0a1e",
    fgMuted: isDark ? "#9ca3af" : "#6b7280",
    fgSubtle: isDark ? "#6b7280" : "#9ca3af",
    cardBg: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.7)",
    cardBorder: isDark ? "rgba(139,92,246,0.2)" : "rgba(124,58,237,0.15)",
    inputBg: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.9)",
    inputBorder: isDark ? "rgba(139,92,246,0.25)" : "rgba(124,58,237,0.2)",
    inputFocusBorder: "#7c3aed",
    orb1: isDark ? "rgba(124,58,237,0.35)" : "rgba(124,58,237,0.15)",
    orb2: isDark ? "rgba(79,70,229,0.25)" : "rgba(79,70,229,0.1)",
    orb3: isDark ? "rgba(167,139,250,0.15)" : "rgba(167,139,250,0.2)",
    divider: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
    success: "#10b981",
    error: "#ef4444",
    errorBg: isDark ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.08)",
  };
}

function AnimatedOrb({ style, color }: { style: any; color: string }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 3000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.9, duration: 3000, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View
      style={[style, { transform: [{ scale: pulse }], backgroundColor: color, borderRadius: 999 }]}
    />
  );
}

function FocusableInput({
  value, onChangeText, placeholder, colors: c, keyboardType, autoCapitalize,
  autoCorrect, icon, secureEntry,
}: {
  value: string; onChangeText: (t: string) => void; placeholder: string;
  colors: ReturnType<typeof buildColors>; keyboardType?: any; autoCapitalize?: any;
  autoCorrect?: boolean; icon: string; secureEntry?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);
  const borderAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(borderAnim, {
      toValue: focused ? 1 : 0, duration: 200, useNativeDriver: false,
    }).start();
  }, [focused]);

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [c.inputBorder, c.inputFocusBorder],
  });

  return (
    <Animated.View style={[styles.inputWrapper, { borderColor, backgroundColor: c.inputBg }]}>
      <Feather name={icon as any} size={17} color={focused ? c.primary : c.fgMuted} style={styles.inputIcon} />
      <TextInput
        style={[styles.inputField, { color: c.fg }]}
        placeholder={placeholder}
        placeholderTextColor={c.fgSubtle}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? "none"}
        autoCorrect={autoCorrect ?? false}
        secureTextEntry={secureEntry && !show}
      />
      {secureEntry && (
        <Pressable onPress={() => setShow(s => !s)} hitSlop={10} style={styles.eyeBtn}>
          <Feather name={show ? "eye-off" : "eye"} size={17} color={c.fgMuted} />
        </Pressable>
      )}
    </Animated.View>
  );
}

function StaggeredItem({ children, delay }: { children: React.ReactNode; delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(anim, { toValue: 1, duration: 500, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 500, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

export default function LoginScreen() {
  const { isAuthenticated, isLoading, loginWithEmail, registerWithEmail, browseAsGuest, loginWithGoogle } = useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch (e: any) {
      setError(e.message ?? "Google sign-in failed");
    } finally {
      setGoogleLoading(false);
    }
  };
  const params = useLocalSearchParams<{ mode?: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const c = buildColors(isDark);

  const initialScreen: Screen =
    params.mode === "login" ? "login-form" : params.mode === "signup" ? "signup-form" : "welcome";

  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const screenAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    screenAnim.setValue(0);
    Animated.timing(screenAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [screen]);

  if (isLoading) return (
    <LinearGradient colors={c.bg} style={styles.center}>
      <LinearGradient colors={c.gradientAccent} style={styles.loadingRing}>
        <ActivityIndicator color="#fff" size="large" />
      </LinearGradient>
    </LinearGradient>
  );
  if (isAuthenticated) return <Redirect href="/(tabs)" />;

  const handleLogin = async () => {
    if (!email || !password) { setError("Please fill in all fields"); return; }
    setSubmitting(true); setError("");
    try {
      await loginWithEmail(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message ?? "Login failed");
    } finally { setSubmitting(false); }
  };

  const handleSignup = async () => {
    if (!email || !password || !firstName) { setError("Please fill in all required fields"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setSubmitting(true); setError("");
    try {
      await registerWithEmail(email.trim(), password, firstName.trim(), lastName.trim());
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message ?? "Sign up failed");
    } finally { setSubmitting(false); }
  };

  const handleGuest = () => { browseAsGuest(); router.replace("/(tabs)"); };

  const features = [
    { icon: "image" as const, label: "Share Moments", desc: "Posts, stories & reels", color: "#7c3aed" },
    { icon: "message-circle" as const, label: "Real-time Chat", desc: "DMs, groups & calls", color: "#4f46e5" },
    { icon: "film" as const, label: "Watch Reels", desc: "Short videos you'll love", color: "#0ea5e9" },
    { icon: "radio" as const, label: "Go Live", desc: "Stream to your followers", color: "#10b981" },
  ];

  if (screen === "welcome") {
    return (
      <LinearGradient colors={c.bg} style={{ flex: 1 }}>
        {/* Background orbs */}
        <AnimatedOrb style={[styles.orb, { width: 320, height: 320, top: -80, right: -80 }]} color={c.orb1} />
        <AnimatedOrb style={[styles.orb, { width: 240, height: 240, bottom: 100, left: -60 }]} color={c.orb2} />
        <AnimatedOrb style={[styles.orb, { width: 160, height: 160, top: height * 0.4, right: 20 }]} color={c.orb3} />

        <SafeAreaView style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={styles.welcomeScroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Logo */}
            <StaggeredItem delay={0}>
              <View style={{ alignItems: "center" }}>
                <VibeLogo size={72} showText={true} />
              </View>
            </StaggeredItem>

            {/* Headline */}
            <StaggeredItem delay={140}>
              <Text style={[styles.tagline, { color: c.fgMuted }]}>
                Connect with the world around you
              </Text>
            </StaggeredItem>

            {/* Feature cards */}
            <StaggeredItem delay={200}>
              <View style={[styles.featureGrid, { borderColor: c.cardBorder, backgroundColor: c.cardBg }]}>
                {features.map((f, i) => (
                  <View key={f.label} style={[
                    styles.featureCell,
                    i % 2 === 0 && i < features.length - 1 && { borderRightWidth: 1, borderRightColor: c.divider },
                    i < 2 && { borderBottomWidth: 1, borderBottomColor: c.divider },
                  ]}>
                    <View style={[styles.featureIconWrap, { backgroundColor: f.color + "18" }]}>
                      <Feather name={f.icon} size={18} color={f.color} />
                    </View>
                    <Text style={[styles.featureCellLabel, { color: c.fg }]}>{f.label}</Text>
                    <Text style={[styles.featureCellDesc, { color: c.fgMuted }]}>{f.desc}</Text>
                  </View>
                ))}
              </View>
            </StaggeredItem>

            {/* CTA buttons */}
            <StaggeredItem delay={300}>
              <Pressable
                onPress={() => setScreen("signup-form")}
                style={({ pressed }) => [styles.primaryBtn, { opacity: pressed ? 0.88 : 1 }]}
              >
                <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={styles.primaryBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Text style={styles.primaryBtnText}>Get Started — It's Free</Text>
                  <Feather name="arrow-right" size={18} color="#fff" />
                </LinearGradient>
              </Pressable>
            </StaggeredItem>

            <StaggeredItem delay={360}>
              <Pressable
                onPress={() => setScreen("login-form")}
                style={({ pressed }) => [styles.outlineBtn, { borderColor: c.cardBorder, backgroundColor: c.cardBg, opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={[styles.outlineBtnText, { color: c.fg }]}>Sign In to Your Account</Text>
              </Pressable>
            </StaggeredItem>

            <StaggeredItem delay={420}>
              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: c.divider }]} />
                <Text style={[styles.dividerText, { color: c.fgSubtle }]}>or</Text>
                <View style={[styles.dividerLine, { backgroundColor: c.divider }]} />
              </View>
              <Pressable
                onPress={handleGoogle}
                disabled={googleLoading}
                style={({ pressed }) => [styles.googleBtn, { borderColor: c.cardBorder, backgroundColor: c.cardBg, opacity: pressed || googleLoading ? 0.75 : 1 }]}
              >
                {googleLoading
                  ? <ActivityIndicator size="small" color={c.fgMuted} />
                  : <>
                      <Text style={styles.googleG}>G</Text>
                      <Text style={[styles.googleBtnText, { color: c.fg }]}>Continue with Google</Text>
                    </>
                }
              </Pressable>
              <Pressable onPress={handleGuest} style={({ pressed }) => [styles.ghostBtn, { opacity: pressed ? 0.7 : 1 }]}>
                <Feather name="eye" size={15} color={c.fgMuted} />
                <Text style={[styles.ghostBtnText, { color: c.fgMuted }]}>Continue as Guest</Text>
              </Pressable>
            </StaggeredItem>

            <StaggeredItem delay={480}>
              <Text style={[styles.legalText, { color: c.fgSubtle }]}>
                By continuing, you agree to our{" "}
                <Text style={{ color: c.primaryLight }}>Terms of Service</Text>
                {" "}and{" "}
                <Text style={{ color: c.primaryLight }}>Privacy Policy</Text>
              </Text>
            </StaggeredItem>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const isLogin = screen === "login-form";

  return (
    <LinearGradient colors={c.bg} style={{ flex: 1 }}>
      <AnimatedOrb style={[styles.orb, { width: 280, height: 280, top: -60, right: -60 }]} color={c.orb1} />
      <AnimatedOrb style={[styles.orb, { width: 200, height: 200, bottom: 80, left: -40 }]} color={c.orb2} />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          <ScrollView
            contentContainerStyle={styles.formScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Back button */}
            <Pressable onPress={() => setScreen("welcome")} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1, borderColor: c.cardBorder, backgroundColor: c.cardBg }]} hitSlop={8}>
              <Feather name="arrow-left" size={18} color={c.fg} />
            </Pressable>

            {/* Header */}
            <StaggeredItem delay={0}>
              <View style={{ alignItems: "center", marginBottom: 12 }}>
                <VibeLogo size={52} showText={false} />
              </View>
              <Text style={[styles.formTitle, { color: c.fg }]}>
                {isLogin ? "Welcome back" : "Create account"}
              </Text>
              <Text style={[styles.formSub, { color: c.fgMuted }]}>
                {isLogin ? "Sign in to continue your journey" : "Join millions of people on Vibe"}
              </Text>
            </StaggeredItem>

            {/* Form card */}
            <StaggeredItem delay={80}>
              <View style={[styles.formCard, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
                {!isLogin && (
                  <View style={styles.nameRow}>
                    <View style={{ flex: 1 }}>
                      <FocusableInput
                        value={firstName} onChangeText={setFirstName}
                        placeholder="First name *" colors={c}
                        icon="user" autoCapitalize="words"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <FocusableInput
                        value={lastName} onChangeText={setLastName}
                        placeholder="Last name" colors={c}
                        icon="user" autoCapitalize="words"
                      />
                    </View>
                  </View>
                )}

                <FocusableInput
                  value={email} onChangeText={setEmail}
                  placeholder="Email address" colors={c}
                  icon="mail" keyboardType="email-address"
                />
                <FocusableInput
                  value={password} onChangeText={setPassword}
                  placeholder="Password" colors={c}
                  icon="lock" secureEntry
                />

                {isLogin && (
                  <Pressable style={styles.forgotWrap}>
                    <Text style={[styles.forgotText, { color: c.primaryLight }]}>Forgot password?</Text>
                  </Pressable>
                )}

                {!!error && (
                  <View style={[styles.errorBox, { backgroundColor: c.errorBg }]}>
                    <Feather name="alert-circle" size={14} color={c.error} />
                    <Text style={[styles.errorText, { color: c.error }]}>{error}</Text>
                  </View>
                )}

                <Pressable
                  onPress={isLogin ? handleLogin : handleSignup}
                  disabled={submitting}
                  style={({ pressed }) => [styles.submitBtn, { opacity: submitting || pressed ? 0.8 : 1 }]}
                >
                  <LinearGradient
                    colors={["#7c3aed", "#4f46e5"]}
                    style={styles.submitBtnGradient}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  >
                    {submitting
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <>
                          <Text style={styles.submitBtnText}>{isLogin ? "Sign In" : "Create Account"}</Text>
                          <Feather name="arrow-right" size={17} color="#fff" />
                        </>
                    }
                  </LinearGradient>
                </Pressable>
              </View>
            </StaggeredItem>

            {/* Switch mode */}
            <StaggeredItem delay={160}>
              <Pressable
                onPress={() => { setError(""); setScreen(isLogin ? "signup-form" : "login-form"); }}
                style={styles.switchRow}
              >
                <Text style={[styles.switchText, { color: c.fgMuted }]}>
                  {isLogin ? "Don't have an account? " : "Already have an account? "}
                </Text>
                <Text style={[styles.switchLink, { color: c.primaryLight }]}>
                  {isLogin ? "Sign Up" : "Sign In"}
                </Text>
              </Pressable>
            </StaggeredItem>

            <StaggeredItem delay={220}>
              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: c.divider }]} />
                <Text style={[styles.dividerText, { color: c.fgSubtle }]}>or</Text>
                <View style={[styles.dividerLine, { backgroundColor: c.divider }]} />
              </View>
              <Pressable
                onPress={handleGoogle}
                disabled={googleLoading}
                style={({ pressed }) => [styles.googleBtn, { borderColor: c.cardBorder, backgroundColor: c.cardBg, opacity: pressed || googleLoading ? 0.75 : 1 }]}
              >
                {googleLoading
                  ? <ActivityIndicator size="small" color={c.fgMuted} />
                  : <>
                      <Text style={styles.googleG}>G</Text>
                      <Text style={[styles.googleBtnText, { color: c.fg }]}>Continue with Google</Text>
                    </>
                }
              </Pressable>
              <Pressable onPress={handleGuest} style={({ pressed }) => [styles.ghostBtn, { opacity: pressed ? 0.7 : 1 }]}>
                <Feather name="eye" size={15} color={c.fgMuted} />
                <Text style={[styles.ghostBtnText, { color: c.fgMuted }]}>Continue as Guest</Text>
              </Pressable>
            </StaggeredItem>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingRing: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },

  // Orbs
  orb: { position: "absolute", zIndex: 0 },

  // Welcome screen
  welcomeScroll: { flexGrow: 1, alignItems: "center", paddingHorizontal: 24, paddingTop: 48, paddingBottom: 36 },
  logoWrap: { alignItems: "center", justifyContent: "center", marginBottom: 20, position: "relative" },
  logoGradient: { width: 88, height: 88, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 12 },
  logoPing: { position: "absolute", width: 104, height: 104, borderRadius: 34, borderWidth: 1.5, opacity: 0.4 },
  appName: { fontSize: 36, fontWeight: "800", letterSpacing: -1, textAlign: "center", marginBottom: 8 },
  tagline: { fontSize: 16, textAlign: "center", marginBottom: 32, lineHeight: 24, paddingHorizontal: 16 },

  featureGrid: { width: "100%", borderRadius: 20, borderWidth: 1, flexDirection: "row", flexWrap: "wrap", overflow: "hidden", marginBottom: 28 },
  featureCell: { width: "50%", padding: 18, alignItems: "flex-start" },
  featureIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  featureCellLabel: { fontSize: 13, fontWeight: "700", marginBottom: 3 },
  featureCellDesc: { fontSize: 12, lineHeight: 17 },

  primaryBtn: { width: "100%", borderRadius: 16, overflow: "hidden", marginBottom: 12, shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 14, elevation: 8 },
  primaryBtnGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 17 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.2 },

  outlineBtn: { width: "100%", paddingVertical: 16, borderRadius: 16, alignItems: "center", borderWidth: 1, marginBottom: 20 },
  outlineBtnText: { fontSize: 15, fontWeight: "700" },

  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, width: "100%", marginBottom: 16 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13 },

  ghostBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 12, width: "100%" },
  ghostBtnText: { fontSize: 14, fontWeight: "500" },

  googleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14, borderRadius: 14, borderWidth: 1, marginBottom: 12, minHeight: 50 },
  googleG: { fontSize: 18, fontWeight: "800", color: "#4285F4", lineHeight: 22 },
  googleBtnText: { fontSize: 15, fontWeight: "600" },

  legalText: { fontSize: 12, textAlign: "center", lineHeight: 18, marginTop: 20, paddingHorizontal: 8 },

  // Form screen
  formScroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  backBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, marginBottom: 28 },
  formLogoCircle: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 16, shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  formTitle: { fontSize: 28, fontWeight: "800", letterSpacing: -0.7, marginBottom: 6 },
  formSub: { fontSize: 15, marginBottom: 24, lineHeight: 22 },

  formCard: { borderRadius: 20, borderWidth: 1, padding: 20, marginBottom: 16, gap: 0 },
  nameRow: { flexDirection: "row", gap: 10 },

  inputWrapper: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 12 },
  inputIcon: { marginRight: 10 },
  inputField: { flex: 1, fontSize: 15 },
  eyeBtn: { padding: 4 },

  forgotWrap: { alignItems: "flex-end", marginTop: -4, marginBottom: 12 },
  forgotText: { fontSize: 13, fontWeight: "600" },

  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { fontSize: 13, flex: 1, lineHeight: 18 },

  submitBtn: { borderRadius: 14, overflow: "hidden", marginTop: 4, shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 7 },
  submitBtnGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.2 },

  switchRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginBottom: 20 },
  switchText: { fontSize: 14 },
  switchLink: { fontSize: 14, fontWeight: "700" },
});
