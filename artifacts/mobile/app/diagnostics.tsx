import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  Platform, Share as RNShare,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import {
  formatBootLog, getLastCrash, clearLastCrash, clearBootLog,
  copyToClipboard, type CrashRecord,
} from "@/lib/bootLog";
import { useColors } from "@/hooks/useColors";

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

export default function DiagnosticsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [crash, setCrash] = useState<CrashRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState("");
  const [logText, setLogText] = useState(formatBootLog());
  const [showFullLog, setShowFullLog] = useState(false);

  const refresh = useCallback(() => {
    getLastCrash().then((c) => { setCrash(c); setLoaded(true); });
    setLogText(formatBootLog());
  }, []);

  // Live-refresh so the log grows while you look at it
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 1500);
    return () => clearInterval(id);
  }, [refresh]);

  const fullReport = () => {
    const c = (Constants.expoConfig ?? {}) as any;
    return [
      `--- Vibe diagnostics ${new Date().toISOString()} ---`,
      `app=${c.name ?? "?"} v${c.version ?? "?"} · ${Platform.OS} ${String(Platform.Version)} · ${__DEV__ ? "dev" : "prod"}`,
      "",
      "=== LAST CRASH ===",
      crash
        ? `${crash.time} fatal=${crash.fatal}\n${crash.message}\n${crash.stack ?? ""}`
        : "(none recorded)",
      "",
      "=== BOOT LOG ===",
      logText || "(empty)",
    ].join("\n");
  };

  const doCopy = async (text: string, tag: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(tag);
      setTimeout(() => setCopied(""), 1500);
    }
  };

  if (!loaded) {
    return (
      <View style={[S.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color="#7c3aed" />
      </View>
    );
  }

  return (
    <View style={[S.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[S.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[S.headerTitle, { color: colors.foreground }]}>Diagnostics</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 16 }}>
        {/* Last crash */}
        <View style={[S.card, { backgroundColor: colors.card, borderColor: crash?.fatal ? "#ef4444" : colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={[S.cardTitle, { color: colors.foreground }]}>Last crash</Text>
            {crash && (
              <Pressable onPress={() => clearLastCrash().then(refresh)} hitSlop={6}>
                <Text style={{ color: "#ef4444", fontSize: 12, fontWeight: "700" }}>Clear</Text>
              </Pressable>
            )}
          </View>
          {crash ? (
            <>
              <Text style={[S.monoText, { color: crash.fatal ? "#ef4444" : colors.foreground }]} selectable>
                {crash.fatal ? "⚠️ FATAL" : "Error"} · {new Date(crash.time).toLocaleString()}
              </Text>
              <Text style={[S.monoText, { color: colors.foreground, marginTop: 6 }]} selectable>
                {crash.message}
              </Text>
              <Text style={[S.monoText, { color: colors.mutedForeground, marginTop: 6, fontSize: 11 }]} numberOfLines={showFullLog ? undefined : 10} selectable>
                {crash.stack ?? "(no stack)"}
              </Text>
              <Pressable onPress={() => setShowFullLog(v => !v)} hitSlop={4}>
                <Text style={{ color: "#7c3aed", fontSize: 12, fontWeight: "600", marginTop: 6 }}>
                  {showFullLog ? "Show less" : "Show full stack"}
                </Text>
              </Pressable>
            </>
          ) : (
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
              No crash recorded since last clear. If the app is dying on launch without reaching this screen, the crash log will appear here on the next successful launch.
            </Text>
          )}
        </View>

        {/* Live boot log */}
        <View style={[S.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={[S.cardTitle, { color: colors.foreground }]}>Boot log (live)</Text>
            <Pressable onPress={() => { clearBootLog(); refresh(); }} hitSlop={6}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: "700" }}>Clear</Text>
            </Pressable>
          </View>
          <ScrollView horizontal>
            <Text style={[S.logText, { color: colors.foreground }]} selectable>
              {logText || "(empty — events appear as the app runs)"}
            </Text>
          </ScrollView>
        </View>

        {/* Actions */}
        <View style={{ gap: 10 }}>
          <Pressable
            onPress={() => doCopy(fullReport(), "report")}
            style={[S.actionBtn, { backgroundColor: "#7c3aed" }]}
            accessibilityRole="button"
            accessibilityLabel="Copy diagnostics report"
          >
            <Feather name="clipboard" size={16} color="#fff" />
            <Text style={S.actionBtnText}>{copied === "report" ? "Copied!" : "Copy full report"}</Text>
          </Pressable>
          <Pressable
            onPress={async () => { await RNShare.share({ message: fullReport() }); }}
            style={[S.actionBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel="Share diagnostics report"
          >
            <Feather name="share-2" size={16} color={colors.foreground} />
            <Text style={[S.actionBtnText, { color: colors.foreground }]}>Share report…</Text>
          </Pressable>
        </View>

        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
          Tip: after a launch crash, reopen the app — the crash is saved and shown above. Use "Copy full report" and paste it to your developer or into an issue.
        </Text>
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700" },
  card: {
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  cardTitle: { fontSize: 14, fontWeight: "800" },
  monoText: { fontFamily: MONO, fontSize: 12, lineHeight: 17 },
  logText: { fontFamily: MONO, fontSize: 10, lineHeight: 15, minWidth: "100%" },
  actionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14, paddingVertical: 13,
  },
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
