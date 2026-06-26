import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import React, { useEffect, useState, type ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Platform, View } from "react-native";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import WelcomeModal from "@/components/WelcomeModal";
import NotificationBanner from "@/components/NotificationBanner";
import {
  registerForPushNotifications,
  savePushToken,
  mapDbNotificationToApp,
  type AppNotification,
} from "@/lib/notifications";
import { supabase } from "@/lib/supabase";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[chatId]" options={{ headerShown: false }} />
      <Stack.Screen name="call/[chatId]" options={{ headerShown: false }} />
      <Stack.Screen name="post/[postId]" options={{ headerShown: false }} />
      <Stack.Screen name="user/[userId]" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, welcomeState, setWelcomeState } = useAuth();
  const router = useRouter();
  const [activeNotif, setActiveNotif] = useState<AppNotification | null>(null);

  const handleNotifNav = (data: Record<string, string> | undefined) => {
    if (!data) return;
    try {
      if (data.type === "message" && data.chatId) router.push(`/chat/${data.chatId}` as any);
      else if ((data.type === "audio_call" || data.type === "video_call") && data.chatId) router.push(`/call/${data.chatId}` as any);
      else if (data.type === "new_post" && data.postId) router.push(`/post/${data.postId}` as any);
      else if (data.type === "live") router.push("/live-sessions" as any);
      else router.push("/notifications" as any);
    } catch { /* noop */ }
  };

  useEffect(() => {
    if (!isAuthenticated || !user || Platform.OS === "web") return;

    registerForPushNotifications().then(token => {
      if (token) savePushToken(user.id, token);
    });

    const foregroundSub = Notifications.addNotificationReceivedListener(notif => {
      const data = notif.request.content.data as Record<string, string>;
      setActiveNotif({
        id: notif.request.identifier,
        type: (data?.type as any) ?? "message",
        title: notif.request.content.title ?? "Notification",
        body: notif.request.content.body ?? "",
        avatarUrl: data?.avatarUrl,
        senderName: data?.senderName,
        data,
        timestamp: Date.now(),
      });
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, string>;
      handleNotifNav(data);
    });

    return () => { foregroundSub.remove(); responseSub.remove(); };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        async (payload: any) => {
          const row = payload.new;
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name, avatar_url")
            .eq("id", row.actor_id ?? "")
            .single();

          const appNotif = mapDbNotificationToApp({
            ...row,
            sender_name: (profile as any)?.display_name,
            sender_avatar: (profile as any)?.avatar_url,
          });
          setActiveNotif(appNotif);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isAuthenticated, user?.id]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      <WelcomeModal
        visible={!!welcomeState}
        type={welcomeState}
        firstName={user?.firstName}
        onDismiss={() => setWelcomeState(null)}
      />
      <NotificationBanner
        notification={activeNotif}
        onDismiss={() => setActiveNotif(null)}
        onPress={n => { setActiveNotif(null); handleNotifNav(n.data); }}
      />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <KeyboardProvider>
              <ThemeProvider>
                <AuthProvider>
                  <AppShell>
                    <RootLayoutNav />
                  </AppShell>
                </AuthProvider>
              </ThemeProvider>
            </KeyboardProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
