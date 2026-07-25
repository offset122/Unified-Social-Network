import { useEffect } from "react";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const url = Linking.getLinkingURL();
    if (url) handleUrl(url);

    const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  async function handleUrl(url: string) {
    try {
      const parsed = new URL(url);
      const hash = parsed.hash.replace("#", "");
      const params = new URLSearchParams(hash || parsed.search);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }
    } catch {}
    router.replace("/(tabs)");
  }

  return null;
}
