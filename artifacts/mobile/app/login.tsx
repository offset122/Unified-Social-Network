import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import { RADIUS } from "@/constants/colors";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import VibeLogo from "@/components/VibeLogo";
import { PromptSheet } from "@/components/ActionSheet";
import { useToast } from "@/components/Toast";
import { useReducedMotion } from "@/lib/motion";

type Screen = "welcome" | "login-form" | "signup-form";

function AnimatedOrb({ style, color }: { style: any; color: string }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.12,
          duration: 3400,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.92,
          duration: 3400,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        style,
        {
          transform: [{ scale: pulse }],
          backgroundColor: color,
          borderRadius: 999,
        },
      ]}
    />
  );
}

function FocusableInput({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  autoCorrect,
  icon,
  secureEntry,
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  keyboardType?: any;
  autoCapitalize?: any;
  autoCorrect?: boolean;
  icon: keyof typeof Feather.glyphMap;
  secureEntry?: boolean;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);

  return (
    <View
      style={[
        styles.inputWrapper,
        {
          borderColor: focused ? colors.accentPrimary : colors.separator,
          backgroundColor: colors.input,
        },
      ]}
    >
      <Feather
        name={icon}
        size={17}
        color={focused ? colors.accentPrimary : colors.textSecondary}
        style={styles.inputIcon}
      />
      <TextInput
        style={[styles.inputField, { color: colors.textPrimary }]}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? "none"}
        autoCorrect={autoCorrect ?? false}
        secureTextEntry={secureEntry && !show}
        accessibilityLabel={accessibilityLabel ?? placeholder}
      />
      {secureEntry && (
        <Pressable
          onPress={() => setShow((s) => !s)}
          style={styles.eyeBtn}
          accessibilityRole="button"
          accessibilityLabel={show ? "Hide password" : "Show password"}
        >
          <Feather
            name={show ? "eye-off" : "eye"}
            size={17}
            color={colors.textSecondary}
          />
        </Pressable>
      )}
    </View>
  );
}

export default function LoginScreen() {
  const {
    isAuthenticated,
    isLoading,
    loginWithEmail,
    registerWithEmail,
    browseAsGuest,
    loginWithGoogle,
  } = useAuth();
  const colors = useColors();
  const { showToast } = useToast();
  const { height } = useWindowDimensions();
  const params = useLocalSearchParams<{ mode?: string }>();

  const initialScreen: Screen =
    params.mode === "login"
      ? "login-form"
      : params.mode === "signup"
      ? "signup-form"
      : "welcome";

  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetPromptOpen, setResetPromptOpen] = useState(false);

  const bgGradient: [string, string, string] = colors.isDark
    ? ["#000000", "#0C071A", "#121216"]
    : ["#FFFFFF", "#F6F4FF", "#F0EDFF"];

  const orbColors = colors.isDark
    ? [
        "rgba(139,92,246,0.22)",
        "rgba(99,102,241,0.16)",
        "rgba(167,139,250,0.10)",
      ]
    : [
        "rgba(109,40,217,0.10)",
        "rgba(99,102,241,0.08)",
        "rgba(139,92,246,0.07)",
      ];

  if (isLoading) {
    return (
      <LinearGradient colors={bgGradient} style={styles.center}>
        <ActivityIndicator color={colors.accentPrimary} size="large" />
      </LinearGradient>
    );
  }

  if (isAuthenticated) return <Redirect href="/(tabs)" />;

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setError("");
    try {
      await loginWithGoogle();
    } catch (e: any) {
      setError(e?.message ?? "Google sign-in failed");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError("Please fill in your email and password.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await loginWithEmail(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e?.message ?? "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async () => {
    if (!email.trim() || !password || !firstName.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await registerWithEmail(
        email.trim(),
        password,
        firstName.trim(),
        lastName.trim(),
      );
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e?.message ?? "Sign up failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (targetEmail: string) => {
    const clean = targetEmail.trim();
    if (!clean || !clean.includes("@")) {
      showToast("Please enter a valid email address", "error");
      return;
    }
    if (!isSupabaseConfigured) {
      showToast("Password reset requires a configured backend", "info");
      return;
    }
    try {
      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(clean);
      if (resetError) throw resetError;
      showToast("Password reset email sent", "success");
    } catch (e: any) {
      showToast(e?.message ?? "Could not send reset email", "error");
    }
  };

  const handleGuest = () => {
    browseAsGuest();
    router.replace("/(tabs)");
  };

  const features = [
    {
      icon: "image" as const,
      label: "Share Moments",
      desc: "Posts, stories & reels",
      color: colors.accentPrimary,
    },
    {
      icon: "message-circle" as const,
      label: "Real-time Chat",
      desc: "DMs, groups & calls",
      color: "#4F46E5",
    },
    {
      icon: "film" as const,
      label: "Watch Reels",
      desc: "Short vertical video",
      color: "#0284C7",
    },
    {
      icon: "radio" as const,
      label: "Go Live",
      desc: "Broadcast with friends",
      color: colors.semanticSuccess,
    },
  ];

  if (screen === "welcome") {
    return (
      <LinearGradient colors={bgGradient} style={{ flex: 1 }}>
        <AnimatedOrb
          style={[styles.orb, { width: 320, height: 320, top: -90, right: -90 }]}
          color={orbColors[0]}
        />
        <AnimatedOrb
          style={[styles.orb, { width: 240, height: 240, bottom: 90, left: -70 }]}
          color={orbColors[1]}
        />
        <AnimatedOrb
          style={[
            styles.orb,
            { width: 150, height: 150, top: height * 0.42, right: 16 },
          ]}
          color={orbColors[2]}
        />

        <SafeAreaView style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={styles.welcomeScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.col}>
              <View style={{ alignItems: "center", marginBottom: 8 }}>
                <VibeLogo size={72} showText={true} />
              </View>

              <Text style={[styles.tagline, { color: colors.textSecondary }]}>
                Connect with the world around you
              </Text>

              <View
                style={[
                  styles.featureGrid,
                  {
                    borderColor: colors.separator,
                    backgroundColor: colors.bgElevated,
                  },
                ]}
              >
                {features.map((f, i) => (
                  <View
                    key={f.label}
                    style={[
                      styles.featureCell,
                      i % 2 === 0 && {
                        borderRightWidth: StyleSheet.hairlineWidth,
                        borderRightColor: colors.separator,
                      },
                      i < 2 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: colors.separator,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.featureIconWrap,
                        { backgroundColor: colors.accentTint },
                      ]}
                    >
                      <Feather name={f.icon} size={18} color={f.color} />
                    </View>
                    <Text
                      style={[
                        styles.featureCellLabel,
                        { color: colors.textPrimary },
                      ]}
                    >
                      {f.label}
                    </Text>
                    <Text
                      style={[
                        styles.featureCellDesc,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {f.desc}
                    </Text>
                  </View>
                ))}
              </View>

              <Pressable
                onPress={() => setScreen("signup-form")}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: colors.accentPrimary,
                    opacity: pressed ? 0.88 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Get started and create an account"
              >
                <Text style={styles.primaryBtnText}>
                  Get Started — It&apos;s Free
                </Text>
                <Feather name="arrow-right" size={18} color="#FFFFFF" />
              </Pressable>

              <Pressable
                onPress={() => setScreen("login-form")}
                style={({ pressed }) => [
                  styles.outlineBtn,
                  {
                    borderColor: colors.separator,
                    backgroundColor: colors.bgElevated,
                    opacity: pressed ? 0.82 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Sign in to your account"
              >
                <Text
                  style={[styles.outlineBtnText, { color: colors.textPrimary }]}
                >
                  Sign In to Your Account
                </Text>
              </Pressable>

              <View style={styles.dividerRow}>
                <View
                  style={[
                    styles.dividerLine,
                    { backgroundColor: colors.separator },
                  ]}
                />
                <Text
                  style={[styles.dividerText, { color: colors.textTertiary }]}
                >
                  or
                </Text>
                <View
                  style={[
                    styles.dividerLine,
                    { backgroundColor: colors.separator },
                  ]}
                />
              </View>

              <Pressable
                onPress={handleGoogle}
                disabled={googleLoading}
                style={({ pressed }) => [
                  styles.googleBtn,
                  {
                    borderColor: colors.separator,
                    backgroundColor: colors.bgElevated,
                    opacity: pressed || googleLoading ? 0.75 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Continue with Google"
              >
                {googleLoading ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <>
                    <Text style={styles.googleG}>G</Text>
                    <Text
                      style={[
                        styles.googleBtnText,
                        { color: colors.textPrimary },
                      ]}
                    >
                      Continue with Google
                    </Text>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={handleGuest}
                style={({ pressed }) => [
                  styles.ghostBtn,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Continue as Guest"
              >
                <Feather name="eye" size={16} color={colors.textSecondary} />
                <Text
                  style={[
                    styles.ghostBtnText,
                    { color: colors.textSecondary },
                  ]}
                >
                  Continue as Guest
                </Text>
              </Pressable>

              <Text style={[styles.legalText, { color: colors.textTertiary }]}>
                By continuing, you agree to Vibe&apos;s Terms of Service and
                Privacy Policy.
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const isLogin = screen === "login-form";

  return (
    <LinearGradient colors={bgGradient} style={{ flex: 1 }}>
      <AnimatedOrb
        style={[styles.orb, { width: 280, height: 280, top: -60, right: -60 }]}
        color={orbColors[0]}
      />
      <AnimatedOrb
        style={[styles.orb, { width: 200, height: 200, bottom: 80, left: -40 }]}
        color={orbColors[1]}
      />

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
            <View style={styles.col}>
              <Pressable
                onPress={() => {
                  setError("");
                  setScreen("welcome");
                }}
                style={({ pressed }) => [
                  styles.backBtn,
                  {
                    opacity: pressed ? 0.7 : 1,
                    borderColor: colors.separator,
                    backgroundColor: colors.bgElevated,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Back to welcome"
              >
                <Feather
                  name="arrow-left"
                  size={18}
                  color={colors.textPrimary}
                />
              </Pressable>

              <View style={{ alignItems: "center", marginBottom: 14 }}>
                <VibeLogo size={52} showText={false} />
              </View>
              <Text style={[styles.formTitle, { color: colors.textPrimary }]}>
                {isLogin ? "Welcome back" : "Create account"}
              </Text>
              <Text style={[styles.formSub, { color: colors.textSecondary }]}>
                {isLogin
                  ? "Sign in to continue your journey"
                  : "Join Vibe to share posts, stories, and messages"}
              </Text>

              <View
                style={[
                  styles.formCard,
                  {
                    backgroundColor: colors.bgElevated,
                    borderColor: colors.separator,
                  },
                ]}
              >
                {!isLogin && (
                  <View style={styles.nameRow}>
                    <View style={{ flex: 1 }}>
                      <FocusableInput
                        value={firstName}
                        onChangeText={setFirstName}
                        placeholder="First name *"
                        icon="user"
                        autoCapitalize="words"
                        accessibilityLabel="First name"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <FocusableInput
                        value={lastName}
                        onChangeText={setLastName}
                        placeholder="Last name"
                        icon="user"
                        autoCapitalize="words"
                        accessibilityLabel="Last name"
                      />
                    </View>
                  </View>
                )}

                <FocusableInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email address"
                  icon="mail"
                  keyboardType="email-address"
                  accessibilityLabel="Email address"
                />
                <FocusableInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  icon="lock"
                  secureEntry
                  accessibilityLabel="Password"
                />

                {isLogin && (
                  <Pressable
                    onPress={() => setResetPromptOpen(true)}
                    style={styles.forgotWrap}
                    accessibilityRole="button"
                    accessibilityLabel="Forgot password"
                  >
                    <Text
                      style={[
                        styles.forgotText,
                        { color: colors.accentPrimary },
                      ]}
                    >
                      Forgot password?
                    </Text>
                  </Pressable>
                )}

                {!!error && (
                  <View
                    style={[
                      styles.errorBox,
                      {
                        backgroundColor: colors.isDark
                          ? "rgba(251,113,133,0.14)"
                          : "rgba(225,29,72,0.08)",
                      },
                    ]}
                  >
                    <Feather
                      name="alert-circle"
                      size={15}
                      color={colors.semanticDanger}
                    />
                    <Text
                      style={[styles.errorText, { color: colors.semanticDanger }]}
                    >
                      {error}
                    </Text>
                  </View>
                )}

                <Pressable
                  onPress={isLogin ? handleLogin : handleSignup}
                  disabled={submitting}
                  style={({ pressed }) => [
                    styles.submitBtn,
                    {
                      backgroundColor: colors.accentPrimary,
                      opacity: submitting || pressed ? 0.85 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={isLogin ? "Sign In" : "Create Account"}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Text style={styles.submitBtnText}>
                        {isLogin ? "Sign In" : "Create Account"}
                      </Text>
                      <Feather name="arrow-right" size={17} color="#FFFFFF" />
                    </>
                  )}
                </Pressable>
              </View>

              <Pressable
                onPress={() => {
                  setError("");
                  setScreen(isLogin ? "signup-form" : "login-form");
                }}
                style={styles.switchRow}
                accessibilityRole="button"
                accessibilityLabel={
                  isLogin ? "Switch to sign up" : "Switch to sign in"
                }
              >
                <Text style={[styles.switchText, { color: colors.textSecondary }]}>
                  {isLogin
                    ? "Don't have an account? "
                    : "Already have an account? "}
                </Text>
                <Text
                  style={[styles.switchLink, { color: colors.accentPrimary }]}
                >
                  {isLogin ? "Sign Up" : "Sign In"}
                </Text>
              </Pressable>

              <View style={styles.dividerRow}>
                <View
                  style={[
                    styles.dividerLine,
                    { backgroundColor: colors.separator },
                  ]}
                />
                <Text
                  style={[styles.dividerText, { color: colors.textTertiary }]}
                >
                  or
                </Text>
                <View
                  style={[
                    styles.dividerLine,
                    { backgroundColor: colors.separator },
                  ]}
                />
              </View>

              <Pressable
                onPress={handleGoogle}
                disabled={googleLoading}
                style={({ pressed }) => [
                  styles.googleBtn,
                  {
                    borderColor: colors.separator,
                    backgroundColor: colors.bgElevated,
                    opacity: pressed || googleLoading ? 0.75 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Continue with Google"
              >
                {googleLoading ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <>
                    <Text style={styles.googleG}>G</Text>
                    <Text
                      style={[
                        styles.googleBtnText,
                        { color: colors.textPrimary },
                      ]}
                    >
                      Continue with Google
                    </Text>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={handleGuest}
                style={({ pressed }) => [
                  styles.ghostBtn,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Continue as Guest"
              >
                <Feather name="eye" size={16} color={colors.textSecondary} />
                <Text
                  style={[
                    styles.ghostBtnText,
                    { color: colors.textSecondary },
                  ]}
                >
                  Continue as Guest
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <PromptSheet
        visible={resetPromptOpen}
        title="Reset Password"
        message="Enter the email address for your account and we'll send a password reset link."
        placeholder="you@example.com"
        initialValue={email}
        submitLabel="Send Link"
        onSubmit={handleResetPassword}
        onClose={() => setResetPromptOpen(false)}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  orb: { position: "absolute", zIndex: 0 },
  col: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
  },
  welcomeScroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 32,
  },
  tagline: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 23,
  },
  featureGrid: {
    width: "100%",
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    flexWrap: "wrap",
    overflow: "hidden",
    marginBottom: 24,
  },
  featureCell: {
    width: "50%",
    padding: 16,
    alignItems: "flex-start",
  },
  featureIconWrap: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  featureCellLabel: { fontSize: 13.5, fontWeight: "700", marginBottom: 2 },
  featureCellDesc: { fontSize: 12, lineHeight: 16 },
  primaryBtn: {
    width: "100%",
    minHeight: 52,
    borderRadius: RADIUS.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  outlineBtn: {
    width: "100%",
    minHeight: 50,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 18,
  },
  outlineBtnText: { fontSize: 15, fontWeight: "600" },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    marginBottom: 14,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 13 },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 48,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  googleG: { fontSize: 17, fontWeight: "800", color: "#4285F4" },
  googleBtnText: { fontSize: 15, fontWeight: "600" },
  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
    width: "100%",
  },
  ghostBtnText: { fontSize: 14.5, fontWeight: "600" },
  legalText: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 14,
    paddingHorizontal: 8,
  },
  formScroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 36,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
    textAlign: "center",
    marginBottom: 6,
  },
  formSub: {
    fontSize: 14.5,
    textAlign: "center",
    marginBottom: 22,
    lineHeight: 20,
  },
  formCard: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    marginBottom: 16,
  },
  nameRow: { flexDirection: "row", gap: 10 },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14,
    minHeight: 48,
    marginBottom: 12,
  },
  inputIcon: { marginRight: 10 },
  inputField: { flex: 1, fontSize: 15, paddingVertical: 11 },
  eyeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  forgotWrap: {
    alignSelf: "flex-end",
    minHeight: 36,
    justifyContent: "center",
    marginBottom: 10,
  },
  forgotText: { fontSize: 13.5, fontWeight: "600" },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: RADIUS.sm,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { fontSize: 13, flex: 1, lineHeight: 18 },
  submitBtn: {
    minHeight: 50,
    borderRadius: RADIUS.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 44,
    marginBottom: 14,
  },
  switchText: { fontSize: 14 },
  switchLink: { fontSize: 14, fontWeight: "700" },
});
