import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, Text } from "react-native";
import { useColors } from "@/hooks/useColors";
import AIFloatingButton from "@/components/AIFloatingButton";
import { useAuth } from "@/lib/auth";
import { fetchUnreadNotificationCount } from "@/lib/db";
import { useQuery } from "@tanstack/react-query";

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
        <Icon sf={{ default: "magnifyingglass", selected: "magnifyingglass" }} />
        <Label>Search</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="reels">
        <Icon sf={{ default: "film", selected: "film.fill" }} />
        <Label>Reels</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="create">
        <Icon sf={{ default: "plus.circle", selected: "plus.circle.fill" }} />
        <Label>Create</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="messages">
        <Icon sf={{ default: "bubble.left.and.bubble.right", selected: "bubble.left.and.bubble.right.fill" }} />
        <Label>Messages</Label>
        {unread > 0 && <View style={nativeBadgeStyles.nativeBadge}><Text style={nativeBadgeStyles.nativeBadgeText}>{unread > 99 ? "99+" : unread}</Text></View>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();
  const { data: unread = 0 } = useQuery({
    queryKey: ["notif-count-classic"],
    queryFn: () => fetchUnreadNotificationCount(user?.id ?? ""),
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () => (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.background },
            ]}
          />
        ),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView ? (
              <SymbolView name="house" tintColor={color} size={24} />
            ) : (
              <Feather name="home" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView ? (
              <SymbolView name="magnifyingglass" tintColor={color} size={24} />
            ) : (
              <Feather name="search" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="reels"
        options={{
          title: "Reels",
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView ? (
              <SymbolView name="film" tintColor={color} size={24} />
            ) : (
              <Feather name="film" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "Create",
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView ? (
              <SymbolView name="plus.circle" tintColor={color} size={24} />
            ) : (
              <Feather name="plus-circle" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : String(unread)) : undefined,
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView ? (
              <SymbolView name="bubble.left.and.bubble.right" tintColor={color} size={24} />
            ) : (
              <Feather name="message-square" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView ? (
              <SymbolView name="person" tintColor={color} size={24} />
            ) : (
              <Feather name="user" size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isIOS && isLiquidGlassAvailable()) {
    return (
      <View style={{ flex: 1 }} pointerEvents="box-none">
        <NativeTabLayout />
        <AIFloatingButton />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }} pointerEvents="box-none">
      <ClassicTabLayout />
      <AIFloatingButton />
    </View>
  );
}

const nativeBadgeStyles = StyleSheet.create({
  nativeBadge: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: "#ef4444",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  nativeBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
});