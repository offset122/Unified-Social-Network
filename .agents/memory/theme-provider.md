---
name: ThemeProvider placement
description: Where ThemeProvider lives in the tree and what useTheme returns
---

`ThemeProvider` from `@/lib/theme` wraps `QueryClientProvider` in `artifacts/mobile/app/_layout.tsx`.

`useTheme()` returns `{ colorScheme: "light" | "dark", toggleTheme: () => void }`.

Persists the chosen scheme to AsyncStorage under key `"theme"`. Uses `Appearance.setColorScheme` to apply it natively.

**How to apply:** In settings or any screen needing theme toggle:
```ts
const { colorScheme, toggleTheme } = useTheme();
const isDark = colorScheme === "dark";
```
