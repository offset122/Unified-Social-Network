import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, Animated, Dimensions,
  ActivityIndicator, Platform, ScrollView, TextInput, Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router } from "expo-router";
import { useAuth } from "@/lib/auth";
import { useColorScheme } from "react-native";

const { height } = Dimensions.get("window");

type Screen = "welcome" | "login-form" | "signup-form";

function buildColors(isDark: boolean) {
  return {
    bg: isDark ? (["#09090b", "#1a0533"] as [string, string]) : (["#f5f3ff", "#ede9fe"] as [string, string]),
    primary: isDark ? "#8b5cf6" : "#6d28d9",
    fg: isDark ? "#fafafa" : "#09090b",
    fgMuted: isDark ? "#a1a1aa" : "#71717a",
    cardBg: isDark ? "rgba(255,255,255,0.06)" : "rgba(109,40,217,0.06)",
    cardBorder: isDark ? "rgba(255,255,255,0.1)" : "rgba(109,40,217,0.15)",
    inputBg: isDark ? "#18181b" : "#ffffff",
    inputBorder: isDark ? "#3f3f46" : "#d4d4d8",
  };
}

function PasswordInput({ value, onChangeText, placeholder, colors: c }: {
  value: string; onChangeText: (t: string) => void;
  placeholder: string; colors: ReturnType<typeof buildColors>;
}) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ position: "relative" }}>
      <TextInput
        style={[styles.input, { color: c.fg, backgroundColor: c.inputBg, borderColor: c.inputBorder }]}
        placeholder={placeholder} placeholderTextColor={c.fgMuted}
        value={value} onChangeText={onChangeText}
        secureTextEntry={!show} autoCapitalize="none" autoCorrect={false}
      />
      <Pressable onPress={() => setShow(s => !s)} style={styles.eyeBtn} hitSlop={8}>
        <Feather name={show ? "eye-off" : "eye"} size={18} color={c.fgMuted} />
      </Pressable>
    </View>
  );
}

export default function LoginScreen() {
  const { isAuthenticated, isLoading, loginWithEmail, registerWithEmail } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const c = buildColors(isDark);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [screen, setScreen] = useState<Screen>("welcome");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }).start();
  }, []);

  if (isLoading) return (
    <LinearGradient colors={c.bg} style={styles.center}>
      <ActivityIndicator color={c.primary} size="large" />
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
    } finally {
      setSubmitting(false);
    }
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
    } finally {
      setSubmitting(false);
    }
  };

  if (screen === "welcome") {
    return (
      <LinearGradient colors={c.bg} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          <Animated.View style={[styles.welcomeWrap, { opacity: fadeAnim }]}>
            <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={styles.logoCircle}>
              <Feather name="zap" size={36} color="#fff" />
            </LinearGradient>
            <Text style={[styles.appName, { color: c.fg }]}>SocialApp</Text>
            <Text style={[styles.tagline, { color: c.fgMuted }]}>Connect, share, and vibe</Text>

            <View style={styles.featureList}>
              {[
                { icon: "home" as const, label: "Share Moments", desc: "Posts, stories & reels" },
                { icon: "message-circle" as const, label: "Real-time Chat", desc: "DMs, groups & calls" },
                { icon: "film" as const, label: "Watch Reels", desc: "Short videos you'll love" },
                { icon: "radio" as const, label: "Go Live", desc: "Stream to your followers" },
              ].map(f => (
                <View key={f.label} style={[styles.featureRow, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
                  <View style={[styles.featureIcon, { backgroundColor: c.primary + "22" }]}>
                    <Feather name={f.icon} size={16} color={c.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.featureLabel, { color: c.fg }]}>{f.label}</Text>
                    <Text style={[styles.featureDesc, { color: c.fgMuted }]}>{f.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Pressable onPress={() => setScreen("signup-form")} style={[styles.primaryBtn, { backgroundColor: c.primary }]}>
              <Text style={styles.primaryBtnText}>Get Started</Text>
            </Pressable>
            <Pressable onPress={() => setScreen("login-form")} style={[styles.secondaryBtn, { borderColor: c.primary }]}>
              <Text style={[styles.secondaryBtnText, { color: c.primary }]}>Sign In</Text>
            </Pressable>
          </Animated.View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const isLogin = screen === "login-form";

  return (
    <LinearGradient colors={c.bg} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.formWrap} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => setScreen("welcome")} style={styles.backBtn} hitSlop={8}>
            <Feather name="arrow-left" size={22} color={c.fg} />
          </Pressable>

          <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={styles.logoCircleSm}>
            <Feather name="zap" size={22} color="#fff" />
          </LinearGradient>
          <Text style={[styles.formTitle, { color: c.fg }]}>{isLogin ? "Welcome back" : "Create account"}</Text>
          <Text style={[styles.formSub, { color: c.fgMuted }]}>{isLogin ? "Sign in to continue" : "Join the community"}</Text>

          {!isLogin && (
            <View style={styles.nameRow}>
              <TextInput
                style={[styles.input, styles.halfInput, { color: c.fg, backgroundColor: c.inputBg, borderColor: c.inputBorder }]}
                placeholder="First name *" placeholderTextColor={c.fgMuted}
                value={firstName} onChangeText={setFirstName} autoCapitalize="words"
              />
              <TextInput
                style={[styles.input, styles.halfInput, { color: c.fg, backgroundColor: c.inputBg, borderColor: c.inputBorder }]}
                placeholder="Last name" placeholderTextColor={c.fgMuted}
                value={lastName} onChangeText={setLastName} autoCapitalize="words"
              />
            </View>
          )}

          <TextInput
            style={[styles.input, { color: c.fg, backgroundColor: c.inputBg, borderColor: c.inputBorder }]}
            placeholder="Email address *" placeholderTextColor={c.fgMuted}
            value={email} onChangeText={setEmail}
            autoCapitalize="none" keyboardType="email-address" autoCorrect={false}
          />
          <PasswordInput value={password} onChangeText={setPassword} placeholder="Password *" colors={c} />

          {!!error && (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={14} color="#ef4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={isLogin ? handleLogin : handleSignup}
            style={[styles.primaryBtn, { backgroundColor: c.primary, opacity: submitting ? 0.7 : 1 }]}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : (
              <Text style={styles.primaryBtnText}>{isLogin ? "Sign In" : "Create Account"}</Text>
            )}
          </Pressable>

          <Pressable onPress={() => setScreen(isLogin ? "signup-form" : "login-form")} style={{ marginTop: 16, alignItems: "center" }}>
            <Text style={{ color: c.fgMuted, fontSize: 14 }}>
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <Text style={{ color: c.primary, fontWeight: "700" }}>{isLogin ? "Sign Up" : "Sign In"}</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  welcomeWrap: { flex: 1, alignItems: "center", paddingHorizontal: 28, paddingTop: 40 },
  logoCircle: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  logoCircleSm: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  appName: { fontSize: 32, fontWeight: "800", letterSpacing: -0.8 },
  tagline: { fontSize: 16, marginTop: 6, marginBottom: 28 },
  featureList: { width: "100%", gap: 10, marginBottom: 36 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1 },
  featureIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  featureLabel: { fontSize: 14, fontWeight: "700" },
  featureDesc: { fontSize: 12, marginTop: 1 },
  primaryBtn: { width: "100%", paddingVertical: 15, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  secondaryBtn: { width: "100%", paddingVertical: 14, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  secondaryBtnText: { fontSize: 16, fontWeight: "700" },
  formWrap: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 20, paddingBottom: 40 },
  backBtn: { marginBottom: 24, width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  formTitle: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5, marginBottom: 4 },
  formSub: { fontSize: 15, marginBottom: 24 },
  nameRow: { flexDirection: "row", gap: 10 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, marginBottom: 14 },
  halfInput: { flex: 1 },
  eyeBtn: { position: "absolute", right: 14, top: 14 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#ef444415", borderRadius: 10, padding: 12, marginBottom: 14 },
  errorText: { color: "#ef4444", fontSize: 13, flex: 1 },
});
