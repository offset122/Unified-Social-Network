import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  Platform,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useColorScheme } from "react-native";
import { useAuth } from "@/lib/auth";

type SectionItem = {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress?: () => void;
  toggle?: boolean;
  value?: boolean;
  onChange?: (v: boolean) => void;
  destructive?: boolean;
  chevron?: boolean;
  note?: string;
};

type Section = {
  title: string;
  items: SectionItem[];
};

function SettingsRow({
  item,
  colors,
  isLast,
}: {
  item: SectionItem;
  colors: any;
  isLast: boolean;
}) {
  return (
    <Pressable
      onPress={item.toggle ? undefined : item.onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.secondary,
          borderBottomColor: colors.border,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          opacity: pressed && !item.toggle ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: item.destructive ? "#fee2e2" : `${colors.primary}18` }]}>
        <Feather
          name={item.icon}
          size={16}
          color={item.destructive ? "#ef4444" : colors.primary}
        />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, { color: item.destructive ? "#ef4444" : colors.foreground }]}>
          {item.label}
        </Text>
        {item.note ? <Text style={[styles.rowNote, { color: colors.mutedForeground }]}>{item.note}</Text> : null}
      </View>
      {item.toggle ? (
        <Switch
          value={item.value}
          onValueChange={item.onChange}
          trackColor={{ false: colors.border, true: colors.primary }}
        />
      ) : item.chevron !== false ? (
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      ) : null}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { logout } = useAuth();
  const colorScheme = useColorScheme();

  const [pushNotifs, setPushNotifs] = useState(true);
  const [emailNotifs, setEmailNotifs] = useState(false);
  const [privateAccount, setPrivateAccount] = useState(false);
  const [showActivity, setShowActivity] = useState(true);

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  const sections: Section[] = [
    {
      title: "Account",
      items: [
        {
          icon: "user",
          label: "Edit Profile",
          onPress: () => router.push("/edit-profile"),
          chevron: true,
        },
        {
          icon: "at-sign",
          label: "Username",
          onPress: () => router.push("/edit-profile"),
          chevron: true,
        },
      ],
    },
    {
      title: "Privacy",
      items: [
        {
          icon: "lock",
          label: "Private Account",
          note: "Only approved followers can see your posts",
          toggle: true,
          value: privateAccount,
          onChange: setPrivateAccount,
        },
        {
          icon: "activity",
          label: "Show Activity Status",
          note: "Let others see when you're active",
          toggle: true,
          value: showActivity,
          onChange: setShowActivity,
        },
      ],
    },
    {
      title: "Notifications",
      items: [
        {
          icon: "bell",
          label: "Push Notifications",
          toggle: true,
          value: pushNotifs,
          onChange: setPushNotifs,
        },
        {
          icon: "mail",
          label: "Email Notifications",
          toggle: true,
          value: emailNotifs,
          onChange: setEmailNotifs,
        },
      ],
    },
    {
      title: "Appearance",
      items: [
        {
          icon: colorScheme === "dark" ? "moon" : "sun",
          label: "Theme",
          note: colorScheme === "dark" ? "Dark mode" : "Light mode",
          onPress: () => {},
          chevron: false,
        },
      ],
    },
    {
      title: "About",
      items: [
        {
          icon: "info",
          label: "Version",
          note: "1.0.0",
          chevron: false,
          onPress: () => {},
        },
        {
          icon: "file-text",
          label: "Terms of Service",
          chevron: true,
          onPress: () => {},
        },
        {
          icon: "shield",
          label: "Privacy Policy",
          chevron: true,
          onPress: () => {},
        },
      ],
    },
    {
      title: "",
      items: [
        {
          icon: "log-out",
          label: "Log Out",
          onPress: handleLogout,
          destructive: true,
          chevron: false,
        },
      ],
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ title: "Settings" }} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 20, paddingBottom: 40 }}>
        {sections.map((section, si) => (
          <View key={si} style={styles.section}>
            {section.title ? (
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
                {section.title.toUpperCase()}
              </Text>
            ) : null}
            <View style={[styles.sectionCard, { borderColor: colors.border }]}>
              {section.items.map((item, ii) => (
                <SettingsRow
                  key={ii}
                  item={item}
                  colors={colors}
                  isLast={ii === section.items.length - 1}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: { marginBottom: 24, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },
  sectionCard: { borderRadius: 14, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  iconWrap: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: "500" },
  rowNote: { fontSize: 12, marginTop: 1 },
});
