---
name: resolveMediaUrl pattern
description: How media URLs are resolved — inline per file, no shared lib
---

`resolveMediaUrl` is defined **inline** in each file that needs it. There is no `@/lib/mediaUrl` module.

```ts
function resolveMediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  if (path.startsWith("/objects/")) return `https://${domain}/api/storage${path}`;
  return `https://${domain}${path}`;
}
```

**Why:** Keeps the dependency surface small; the logic is trivial enough to inline.
