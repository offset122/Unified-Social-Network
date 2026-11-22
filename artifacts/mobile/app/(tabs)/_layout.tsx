import { Tabs, usePathname, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { fetchUnreadNotificationCount } from "@/lib/db";
import { useQuery } from "@tanstack/react-query";
import { GlassSurface } from "@/components/GlassSurface";
import VibeLogo from "@/components/VibeLogo";
import { haptics } from "@/lib/motion";
import { RADIUS } from "@/constants/colors";

const isIOS = Platform.OS === "ios";

const isLiquidGlassAvailable: () => boolean = isIOS
  ? require("expo-glass-effect").isLiquidGlassAvailable
  : () => false;
const SymbolView: React.ComponentType<any> | null = isIOS
  ? require("expo-symbols").SymbolView
  : null;
const NativeTabsModule = isIOS
  ? require("expo-router/unstable-native-tabs")
  : null;

const DESKTOP_NAV_ITEMS: {
  name: string;
  href: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
}[] = [
  { name: "index", href: "/(tabs)", label: "Home", icon: "home" },
  { name: "search", href: "/(tabs)/search", label: "Explore", icon: "compass" },
  { name: "reels", href: "/(tabs)/reels", label: "Reels", icon: "film" },
  { name: "messages", href: "/(tabs)/messages", label: "Messages", icon: "message-circle" },
  { name: "profile", href: "/(tabs)/profile", label: "Profile", icon: "user" },
];

function NativeTabLayout() {
  if (!NativeTabsModule) return null;
  const { NativeTabs, Icon, Label } = NativeTabsModule;
  const { user } = useAuth();
  const { data: unread = 0 } = useQuery({
    queryKey: ["notif-count-native"],
    queryFn: () => fetchUnreadNotificationCount(user?.id ?? ""),
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search">
        <Icon sf={{ default: "safari", selected: "safari.fill" }} />
        <Label>Explore</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="reels">
        <Icon sf={{ default: "film", selected: "film.fill" }} />
        <Label>Reels</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="messages">
        <Icon sf={{ default: "bubble.left.and.bubble.right", selected: "bubble.left.and.bubble.right.fill" }} />
        <Label>Messages</Label>
        {unread > 0 && (
          <View style={nativeBadgeStyles.nativeBadge}>
            <Text style={nativeBadgeStyles.nativeBadgeText}>
              {unread > 99 ? "99+" : unread}
            </Text>
          </View>
        )}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function DesktopSidebarRail({ unread }: { unread: number }) {
  const colors = useColors();
  const pathname = usePathname();
  const router = useRouter();
  const isReels = pathname.includes("/reels");

  const surfaceBg = isReels ? "rgba(12,12,16,0.94)" : colors.bgMaterial;
  const primaryText = isReels ? "#F5F5F7" : colors.textPrimary;
  const secondaryText = isReels ? "#A1A1AA" : colors.textSecondary;
  const borderCol = isReels ? "rgba(255,255,255,0.12)" : colors.separator;

  const isRouteActive = (name: string) => {
    if (name === "index") {
      return pathname === "/" || pathname === "/(tabs)" || pathname === "/(tabs)/index";
    }
    return pathname.endsWith(`/${name}`);
  };

  return (
    <View
      accessibilityRole="menu"
      style={[
        desktopStyles.rail,
        {
          backgroundColor: surfaceBg,
          borderRightColor: borderCol,
        },
        Platform.OS === "web"
          ? ({
              backdropFilter: "saturate(180%) blur(20px)",
              WebkitBackdropFilter: "saturate(180%) blur(20px)",
            } as any)
          : null,
      ]}
    >
      <View style={desktopStyles.brandRow}>
        <VibeLogo size={32} showText showTagline={false} />
      </View>

      <View style={desktopStyles.navList}>
        {DESKTOP_NAV_ITEMS.map((item) => {
          const active = isRouteActive(item.name);
          return (
            <Pressable
              key={item.name}
              onPress={() => {
                haptics.selection();
                router.push(item.href as any);
              }}
              style={({ pressed }) => [
                desktopStyles.navItem,
                active && { backgroundColor: colors.accentTint },
                pressed && { opacity: 0.78 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
            >
              <Feather
                name={item.icon}
                size={20}
                color={active ? colors.accentPrimary : secondaryText}
              />
              <Text
                style={[
                  desktopStyles.navLabel,
                  {
                    color: active ? colors.accentPrimary : primaryText,
                    fontWeight: active ? "700" : "500",
                  },
                ]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
              {item.name === "messages" && unread > 0 && (
                <View style={[desktopStyles.badge, { backgroundColor: colors.semanticDanger }]}>
                  <Text style={desktopStyles.badgeText}>
                    {unread > 99 ? "99+" : unread}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => {
          haptics.light();
          router.push("/(tabs)/create" as any);
        }}
        style={({ pressed }) => [
          desktopStyles.createBtn,
          {
            backgroundColor: colors.accentPrimary,
            opacity: pressed ? 0.88 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Create post"
      >
        <Feather name="plus" size={18} color="#FFFFFF" />
        <Text style={desktopStyles.createBtnText}>Create</Text>
      </Pressable>

      <Pressable
        onPress={() => {
          haptics.selection();
          router.push("/settings" as any);
        }}
        style={({ pressed }) => [
          desktopStyles.navItem,
          { marginTop: "auto", opacity: pressed ? 0.78 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Settings"
      >
        <Feather name="settings" size={19} color={secondaryText} />
        <Text style={[desktopStyles.navLabel, { color: secondaryText }]}>
          Settings
        </Text>
      </Pressable>
    </View>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && width >= 768;
  const isReels = pathname.includes("/reels");

  const { user } = useAuth();
  const { data: unread = 0 } = useQuery({
    queryKey: ["notif-count-classic"],
    queryFn: () => fetchUnreadNotificationCount(user?.id ?? ""),
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  const barBg = isReels ? "rgba(14,14,18,0.88)" : colors.bgMaterial;
  const activeTint = isReels ? "#FFFFFF" : colors.accentPrimary;
  const inactiveTint = isReels ? "rgba(255,255,255,0.62)" : colors.textSecondary;
  const borderTopColor = isReels ? "rgba(255,255,255,0.12)" : colors.separator;

  const tabsNode = (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeTint,
        tabBarInactiveTintColor: inactiveTint,
        headerShown: false,
        tabBarLabelStyle: {
          fontSize: 10.5,
          fontWeight: "600",
          marginBottom: Platform.OS === "web" ? 4 : 0,
        },
        tabBarStyle: isDesktopWeb
          ? { display: "none" }
          : {
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "transparent",
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor,
              elevation: 0,
              height: Platform.OS === "web" ? 64 : 56 + insets.bottom,
              paddingTop: 4,
              paddingBottom: Platform.OS === "web" ? 6 : Math.max(insets.bottom, 6),
            },
        tabBarBackground: () => (
          <GlassSurface
            tint={isReels ? "dark" : "material"}
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: barBg,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor,
              },
            ]}
          />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView ? (
              <SymbolView name="house" tintColor={color} size={22} />
            ) : (
              <Feather name="home" size={21} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Explore",
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView ? (
              <SymbolView name="safari" tintColor={color} size={22} />
            ) : (
              <Feather name="compass" size={21} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="reels"
        options={{
          title: "Reels",
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView ? (
              <SymbolView name="film" tintColor={color} size={22} />
            ) : (
              <Feather name="film" size={21} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          href: null,
          title: "Create",
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : String(unread)) : undefined,
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView ? (
              <SymbolView name="bubble.left.and.bubble.right" tintColor={color} size={22} />
            ) : (
              <Feather name="message-circle" size={21} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView ? (
              <SymbolView name="person" tintColor={color} size={22} />
            ) : (
              <Feather name="user" size={21} color={color} />
            ),
        }}
      />
    </Tabs>
  );

  if (isDesktopWeb) {
    return (
      <View style={[desktopStyles.shell, { backgroundColor: colors.bgCanvas }]}>
        <DesktopSidebarRail unread={unread} />
        <View style={desktopStyles.main}>{tabsNode}</View>
      </View>
    );
  }

  return tabsNode;
}

export default function TabLayout() {
  if (isIOS && isLiquidGlassAvailable()) {
    return (
      <View style={{ flex: 1 }} pointerEvents="box-none">
        <NativeTabLayout />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }} pointerEvents="box-none">
      <ClassicTabLayout />
    </View>
  );
}

const desktopStyles = StyleSheet.create({
  shell: {
    flex: 1,
    flexDirection: "row",
  },
  rail: {
    width: 240,
    paddingHorizontal: 14,
    paddingVertical: 20,
    borderRightWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  brandRow: {
    paddingHorizontal: 10,
    paddingBottom: 16,
  },
  navList: {
    gap: 4,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    height: 46,
    paddingHorizontal: 12,
    borderRadius: RADIUS.sm,
    gap: 12,
  },
  navLabel: {
    fontSize: 15,
    flex: 1,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  createBtn: {
    marginTop: 12,
    height: 46,
    borderRadius: RADIUS.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  createBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
});

const nativeBadgeStyles = StyleSheet.create({
  nativeBadge: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: "#E11D48",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  nativeBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
});