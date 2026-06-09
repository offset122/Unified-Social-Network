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
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth";
import { useColorScheme } from "react-native";

const { height } = Dimensions.get("window");

const FEATURES = [
  { icon: "home" as const,           label: "Share Moments",    desc: "Post photos, stories & updates" },
  { icon: "message-circle" as const, label: "Real-time Chat",   desc: "DMs, groups & channels" },
  { icon: "users" as const,          label: "Build Community",  desc: "Create groups & stay connected" },
  { icon: "rss" as const,            label: "Follow Channels",  desc: "Curated content you love" },
];

type Screen = "welcome" | "action" | "login-form" | "signup-form";

function PasswordInput({
  value,
  onChangeText,
  placeholder,
  colors: c,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  colors: ReturnType<typeof buildColors>;
}) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ position: "relative" }}>
      <TextInput
        style={[styles.input, { color: c.fg, backgroundColor: c.inputBg, borderColor: c.inputBorder }]}
        placeholder={placeholder}
        placeholderTextColor={c.fgMuted}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable
        onPress={() => setShow((s) => !s)}
        style={styles.eyeBtn}
        hitSlop={8}
      >
        <Feather name={show ? "eye-off" : "eye"} size={18} color={c.fgMuted} />
      </Pressable>
    </View>
  );
}

function buildColors(isDark: boolean) {
  return {
    bg: isDark ? (["#09090b", "#1a0533"] as [string, string]) : (["#f5f3ff", "#ede9fe"] as [string, string]),
    blobA: isDark ? (["#4c1d95", "#6d28d9"] as [string, string]) : (["#c4b5fd", "#8b5cf6"] as [string, string]),
    blobB: isDark ? (["#1e1b4b", "#312e81"] as [string, string]) : (["#ddd6fe", "#a78bfa"] as [string, string]),
    primary: isDark ? "#8b5cf6" : "#6d28d9",
    fg: isDark ? "#fafafa" : "#09090b",
    fgMuted: isDark ? "#a1a1aa" : "#71717a",
    cardBg: isDark ? "rgba(255,255,255,0.06)" : "rgba(109,40,217,0.06)",
    cardBorder: isDark ? "rgba(255,255,255,0.1)" : "rgba(109,40,217,0.15)",
    inputBg: isDark ? "#18181b" : "#ffffff",
    inputBorder: isDark ? "#3f3f46" : "#d4d4d8",
    error: "#ef4444",
  };
}

export default function LoginScreen() {
  const { login, loginWithEmail, registerWithEmail, isAuthenticated, isLoading } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const c = buildColors(isDark);

  const [screen, setScreen] = useState<Screen>("welcome");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const isWeb = Platform.OS === "web";
  const fadeAnim = useRef(new Animated.Value(isWeb ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(isWeb ? 0 : 30)).current;
  const logoScale = useRef(new Animated.Value(isWeb ? 1 : 0.8)).current;
  const logoRotate = useRef(new Animated.Value(isWeb ? 1 : 0)).current;
  const featureAnims = useRef(FEATURES.map(() => new Animated.Value(isWeb ? 1 : 0))).current;
  const screenFade = useRef(new Animated.Value(1)).current;

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

  const ND = !isWeb;

  const goTo = (next: Screen) => {
    setError(null);
    Animated.timing(screenFade, { toValue: 0, duration: 180, useNativeDriver: ND }).start(() => {
      setScreen(next);
      Animated.timing(screenFade, { toValue: 1, duration: 250, useNativeDriver: ND }).start();
    });
  };

  const handleEmailLogin = async () => {
    if (!email.trim() || !password) { setError("Please fill in all fields."); return; }
    setError(null);
    setSubmitting(true);
    try {
      await loginWithEmail(email.trim(), password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes("401") ? "Invalid email or password." : msg.includes("different sign-in") ? "This account uses a different sign-in method." : "Sign-in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailRegister = async () => {
    if (!email.trim() || !password) { setError("Please fill in all fields."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setError(null);
    setSubmitting(true);
    try {
      await registerWithEmail(email.trim(), password, firstName.trim() || undefined, lastName.trim() || undefined);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes("409") ? "This email is already registered." : "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const spinInterpolate = logoRotate.interpolate({ inputRange: [0, 1], outputRange: ["-15deg", "0deg"] });

  if (!isLoading && isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={c.bg} style={StyleSheet.absoluteFill} />
      <View style={[styles.blob, { top: -80, right: -60, width: 260, height: 260, borderRadius: 130, opacity: 0.35 }]}>
        <LinearGradient colors={c.blobA} style={StyleSheet.absoluteFill} />
      </View>
      <View style={[styles.blob, { bottom: 120, left: -80, width: 300, height: 300, borderRadius: 150, opacity: 0.3 }]}>
        <LinearGradient colors={c.blobB} style={StyleSheet.absoluteFill} />
      </View>
      <View style={[styles.blob, { top: height * 0.4, right: -40, width: 160, height: 160, borderRadius: 80, opacity: 0.2 }]}>
        <LinearGradient colors={c.blobA} style={StyleSheet.absoluteFill} />
      </View>

      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Animated.View style={[styles.inner, { opacity: screenFade }]}>

            {screen === "welcome" && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
                <Animated.View style={[styles.logoWrap, { opacity: fadeAnim, transform: [{ scale: logoScale }, { rotate: spinInterpolate }] }]}>
                  <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={styles.logoGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <Text style={styles.logoLetter}>S</Text>
                  </LinearGradient>
                </Animated.View>

                <Animated.View style={[styles.headingBlock, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                  <Text style={[styles.appName, { color: c.fg }]}>SocialApp</Text>
                  <Text style={[styles.tagline, { color: c.fgMuted }]}>Your world, connected.</Text>
                </Animated.View>

                <View style={styles.features}>
                  {FEATURES.map((f, i) => (
                    <Animated.View
                      key={f.label}
                      style={[
                        styles.featureCard,
                        { backgroundColor: c.cardBg, borderColor: c.cardBorder },
                        { opacity: featureAnims[i], transform: [{ translateY: featureAnims[i].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] },
                      ]}
                    >
                      <View style={[styles.featureIconWrap, { backgroundColor: c.primary + "22" }]}>
                        <Feather name={f.icon} size={18} color={c.primary} />
                      </View>
                      <View style={styles.featureText}>
                        <Text style={[styles.featureLabel, { color: c.fg }]}>{f.label}</Text>
                        <Text style={[styles.featureDesc, { color: c.fgMuted }]}>{f.desc}</Text>
                      </View>
                    </Animated.View>
                  ))}
                </View>

                <Animated.View style={[styles.ctas, { opacity: fadeAnim }]}>
                  <Pressable
                    style={({ pressed }) => [styles.btn, styles.btnPrimary, { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 }]}
                    onPress={() => goTo("action")}
                  >
                    <Text style={[styles.btnText, { color: "#fff" }]}>Get Started</Text>
                    <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
                  </Pressable>
                </Animated.View>
              </ScrollView>
            )}

            {screen === "action" && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
                <Pressable style={styles.backBtn} onPress={() => goTo("welcome")}>
                  <View style={[styles.backCircle, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
                    <Feather name="arrow-left" size={20} color={c.fg} />
                  </View>
                </Pressable>

                <View style={styles.actionTop}>
                  <LinearGradient colors={["#7c3aed", "#4f46e5"]} style={styles.logoGradSmall} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <Text style={styles.logoLetterSmall}>S</Text>
                  </LinearGradient>
                  <Text style={[styles.actionTitle, { color: c.fg }]}>Welcome</Text>
                  <Text style={[styles.actionSubtitle, { color: c.fgMuted }]}>Sign up or log in to continue{"\n"}to SocialApp</Text>
                </View>

                <View style={{ gap: 0 }}>
                  <Pressable
                    style={({ pressed }) => [styles.authCard, { backgroundColor: c.cardBg, borderColor: c.cardBorder, opacity: pressed ? 0.8 : 1 }]}
                    onPress={() => goTo("signup-form")}
                  >
                    <View style={[styles.authCardIcon, { backgroundColor: c.primary + "22" }]}>
                      <Feather name="user-plus" size={22} color={c.primary} />
                    </View>
                    <View style={styles.authCardText}>
                      <Text style={[styles.authCardTitle, { color: c.fg }]}>Create an Account</Text>
                      <Text style={[styles.authCardDesc, { color: c.fgMuted }]}>New here? Join millions of users</Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={c.fgMuted} />
                  </Pressable>

                  <View style={styles.dividerRow}>
                    <View style={[styles.dividerLine, { backgroundColor: c.cardBorder }]} />
                    <Text style={[styles.dividerText, { color: c.fgMuted }]}>or</Text>
                    <View style={[styles.dividerLine, { backgroundColor: c.cardBorder }]} />
                  </View>

                  <Pressable
                    style={({ pressed }) => [styles.authCard, { backgroundColor: c.cardBg, borderColor: c.cardBorder, opacity: pressed ? 0.8 : 1 }]}
                    onPress={() => goTo("login-form")}
                  >
                    <View style={[styles.authCardIcon, { backgroundColor: c.primary + "22" }]}>
                      <Feather name="log-in" size={22} color={c.primary} />
                    </View>
                    <View style={styles.authCardText}>
                      <Text style={[styles.authCardTitle, { color: c.fg }]}>Log In</Text>
                      <Text style={[styles.authCardDesc, { color: c.fgMuted }]}>Welcome back, continue your journey</Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={c.fgMuted} />
                  </Pressable>
                </View>

                <Text style={[styles.legal, { color: c.fgMuted, marginTop: 32 }]}>
                  By continuing you agree to our{" "}
                  <Text style={{ color: c.primary }}>Terms of Service</Text>
                  {" "}and{" "}
                  <Text style={{ color: c.primary }}>Privacy Policy</Text>
                </Text>
              </ScrollView>
            )}

            {screen === "login-form" && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
                <Pressable style={styles.backBtn} onPress={() => goTo("action")}>
                  <View style={[styles.backCircle, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
                    <Feather name="arrow-left" size={20} color={c.fg} />
                  </View>
                </Pressable>

                <View style={styles.formHeader}>
                  <Text style={[styles.formTitle, { color: c.fg }]}>Welcome back</Text>
                  <Text style={[styles.formSubtitle, { color: c.fgMuted }]}>Sign in to your account</Text>
                </View>

                <View style={styles.form}>
                  <View style={styles.fieldGroup}>
                    <Text style={[styles.fieldLabel, { color: c.fg }]}>Email</Text>
                    <TextInput
                      style={[styles.input, { color: c.fg, backgroundColor: c.inputBg, borderColor: c.inputBorder }]}
                      placeholder="you@example.com"
                      placeholderTextColor={c.fgMuted}
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={[styles.fieldLabel, { color: c.fg }]}>Password</Text>
                    <PasswordInput value={password} onChangeText={setPassword} placeholder="Your password" colors={c} />
                  </View>

                  {error && (
                    <View style={[styles.errorBox, { backgroundColor: "#fee2e2", borderColor: "#fca5a5" }]}>
                      <Feather name="alert-circle" size={15} color="#ef4444" />
                      <Text style={[styles.errorText, { color: "#dc2626" }]}>{error}</Text>
                    </View>
                  )}

                  <Pressable
                    style={({ pressed }) => [styles.btn, styles.btnPrimary, { backgroundColor: c.primary, opacity: submitting || pressed ? 0.8 : 1 }]}
                    onPress={handleEmailLogin}
                    disabled={submitting}
                  >
                    {submitting
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={[styles.btnText, { color: "#fff" }]}>Sign In</Text>
                    }
                  </Pressable>

                  <View style={styles.dividerRow}>
                    <View style={[styles.dividerLine, { backgroundColor: c.cardBorder }]} />
                    <Text style={[styles.dividerText, { color: c.fgMuted }]}>or</Text>
                    <View style={[styles.dividerLine, { backgroundColor: c.cardBorder }]} />
                  </View>

                  <Pressable
                    style={({ pressed }) => [styles.btn, styles.btnOutline, { borderColor: c.cardBorder, backgroundColor: c.cardBg, opacity: pressed ? 0.7 : 1 }]}
                    onPress={login}
                  >
                    <Feather name="shield" size={17} color={c.primary} style={{ marginRight: 8 }} />
                    <Text style={[styles.btnText, { color: c.fg, fontSize: 15 }]}>Continue with Replit</Text>
                  </Pressable>
                </View>

                <Pressable onPress={() => goTo("signup-form")} style={styles.switchLink}>
                  <Text style={[styles.switchText, { color: c.fgMuted }]}>
                    Don't have an account?{" "}
                    <Text style={{ color: c.primary, fontWeight: "600" }}>Sign Up</Text>
                  </Text>
                </Pressable>
              </ScrollView>
            )}

            {screen === "signup-form" && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
                <Pressable style={styles.backBtn} onPress={() => goTo("action")}>
                  <View style={[styles.backCircle, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
                    <Feather name="arrow-left" size={20} color={c.fg} />
                  </View>
                </Pressable>

                <View style={styles.formHeader}>
                  <Text style={[styles.formTitle, { color: c.fg }]}>Create account</Text>
                  <Text style={[styles.formSubtitle, { color: c.fgMuted }]}>Join SocialApp today</Text>
                </View>

                <View style={styles.form}>
                  <View style={styles.nameRow}>
                    <View style={[styles.fieldGroup, { flex: 1 }]}>
                      <Text style={[styles.fieldLabel, { color: c.fg }]}>First Name</Text>
                      <TextInput
                        style={[styles.input, { color: c.fg, backgroundColor: c.inputBg, borderColor: c.inputBorder }]}
                        placeholder="Alex"
                        placeholderTextColor={c.fgMuted}
                        value={firstName}
                        onChangeText={setFirstName}
                        autoCapitalize="words"
                        autoComplete="given-name"
                      />
                    </View>
                    <View style={[styles.fieldGroup, { flex: 1 }]}>
                      <Text style={[styles.fieldLabel, { color: c.fg }]}>Last Name</Text>
                      <TextInput
                        style={[styles.input, { color: c.fg, backgroundColor: c.inputBg, borderColor: c.inputBorder }]}
                        placeholder="Smith"
                        placeholderTextColor={c.fgMuted}
                        value={lastName}
                        onChangeText={setLastName}
                        autoCapitalize="words"
                        autoComplete="family-name"
                      />
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={[styles.fieldLabel, { color: c.fg }]}>Email</Text>
                    <TextInput
                      style={[styles.input, { color: c.fg, backgroundColor: c.inputBg, borderColor: c.inputBorder }]}
                      placeholder="you@example.com"
                      placeholderTextColor={c.fgMuted}
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={[styles.fieldLabel, { color: c.fg }]}>Password</Text>
                    <PasswordInput value={password} onChangeText={setPassword} placeholder="Min. 8 characters" colors={c} />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={[styles.fieldLabel, { color: c.fg }]}>Confirm Password</Text>
                    <PasswordInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Repeat password" colors={c} />
                  </View>

                  {error && (
                    <View style={[styles.errorBox, { backgroundColor: "#fee2e2", borderColor: "#fca5a5" }]}>
                      <Feather name="alert-circle" size={15} color="#ef4444" />
                      <Text style={[styles.errorText, { color: "#dc2626" }]}>{error}</Text>
                    </View>
                  )}

                  <Pressable
                    style={({ pressed }) => [styles.btn, styles.btnPrimary, { backgroundColor: c.primary, opacity: submitting || pressed ? 0.8 : 1 }]}
                    onPress={handleEmailRegister}
                    disabled={submitting}
                  >
                    {submitting
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={[styles.btnText, { color: "#fff" }]}>Create Account</Text>
                    }
                  </Pressable>

                  <View style={styles.dividerRow}>
                    <View style={[styles.dividerLine, { backgroundColor: c.cardBorder }]} />
                    <Text style={[styles.dividerText, { color: c.fgMuted }]}>or</Text>
                    <View style={[styles.dividerLine, { backgroundColor: c.cardBorder }]} />
                  </View>

                  <Pressable
                    style={({ pressed }) => [styles.btn, styles.btnOutline, { borderColor: c.cardBorder, backgroundColor: c.cardBg, opacity: pressed ? 0.7 : 1 }]}
                    onPress={login}
                  >
                    <Feather name="shield" size={17} color={c.primary} style={{ marginRight: 8 }} />
                    <Text style={[styles.btnText, { color: c.fg, fontSize: 15 }]}>Continue with Replit</Text>
                  </Pressable>
                </View>

                <Pressable onPress={() => goTo("login-form")} style={styles.switchLink}>
                  <Text style={[styles.switchText, { color: c.fgMuted }]}>
                    Already have an account?{" "}
                    <Text style={{ color: c.primary, fontWeight: "600" }}>Log In</Text>
                  </Text>
                </Pressable>
              </ScrollView>
            )}

          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {submitting && (
        <View style={styles.loadingOverlay}>
          {Platform.OS === "ios"
            ? <BlurView intensity={60} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
            : <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(9,9,11,0.7)" : "rgba(255,255,255,0.7)" }]} />
          }
          <View style={[styles.loadingCard, { backgroundColor: isDark ? "#1c1c1e" : "#ffffff" }]}>
            <ActivityIndicator size="large" color={c.primary} />
            <Text style={[styles.loadingText, { color: c.fg }]}>Signing in…</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  kav: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },
  blob: { position: "absolute", overflow: "hidden" },

  logoWrap: { alignItems: "center", marginTop: 24, marginBottom: 20 },
  logoGrad: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 16, elevation: 12,
  },
  logoLetter: { fontSize: 40, fontWeight: "800", color: "#fff", lineHeight: 48 },

  headingBlock: { alignItems: "center", marginBottom: 28 },
  appName: { fontSize: 36, fontWeight: "800", letterSpacing: -1, marginBottom: 6 },
  tagline: { fontSize: 17, letterSpacing: 0.2 },

  features: { gap: 10, marginBottom: 28 },
  featureCard: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 16, borderWidth: 1,
    paddingVertical: 14, paddingHorizontal: 16,
  },
  featureIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 14 },
  featureText: { flex: 1 },
  featureLabel: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
  featureDesc: { fontSize: 13 },

  ctas: {},
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 16, paddingVertical: 16,
  },
  btnPrimary: {
    shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  btnOutline: { borderWidth: 1 },
  btnText: { fontSize: 17, fontWeight: "700" },

  backBtn: { marginBottom: 20, alignSelf: "flex-start" },
  backCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },

  actionTop: { alignItems: "center", marginBottom: 36 },
  logoGradSmall: {
    width: 56, height: 56, borderRadius: 18,
    alignItems: "center", justifyContent: "center", marginBottom: 20,
    shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  logoLetterSmall: { fontSize: 28, fontWeight: "800", color: "#fff", lineHeight: 34 },
  actionTitle: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5, marginBottom: 8 },
  actionSubtitle: { fontSize: 16, textAlign: "center", lineHeight: 24 },

  authCard: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 18, borderWidth: 1,
    paddingVertical: 18, paddingHorizontal: 18,
  },
  authCardIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 14 },
  authCardText: { flex: 1 },
  authCardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 2 },
  authCardDesc: { fontSize: 13 },

  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 16, paddingHorizontal: 4 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13, marginHorizontal: 12 },

  legal: { fontSize: 12, textAlign: "center", lineHeight: 18 },

  formHeader: { marginBottom: 28 },
  formTitle: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginBottom: 6 },
  formSubtitle: { fontSize: 16 },

  form: { gap: 16 },
  nameRow: { flexDirection: "row", gap: 12 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 14, fontWeight: "600" },
  input: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 16,
  },
  eyeBtn: { position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" },

  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
  },
  errorText: { flex: 1, fontSize: 14 },

  switchLink: { alignItems: "center", paddingVertical: 24 },
  switchText: { fontSize: 14, textAlign: "center" },

  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", zIndex: 100 },
  loadingCard: {
    borderRadius: 20, paddingVertical: 32, paddingHorizontal: 40,
    alignItems: "center", gap: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
  },
  loadingText: { fontSize: 15, fontWeight: "500" },
});
