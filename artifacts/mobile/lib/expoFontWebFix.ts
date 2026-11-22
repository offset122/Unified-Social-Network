import { Platform } from "react-native";

if (Platform.OS === "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("expo-font/build/ExpoFontLoader");
    const target = mod?.default ?? mod;
    if (typeof target === "function" && typeof target.isLoaded !== "function") {
      const resolved = target();
      if (resolved && typeof resolved.isLoaded === "function") {
        Object.assign(target, resolved);
      }
    }
  } catch {
    // Ignore if already patched or unavailable in native/SSR builds.
  }
}
