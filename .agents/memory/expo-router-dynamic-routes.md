---
name: Expo Router dynamic routes type casting
description: Dynamic route strings not in the typed route list need `as any` cast.
---

Expo Router v6 generates a strict typed route list. Dynamic routes like `/user/${id}` and routes that don't yet have a screen file (e.g. `/change-password`) cause `TS2322` assignment errors.

**Fix:** Cast to `as any`:
```ts
router.push("/change-password" as any);
// or
<Link href={`/user/${userId}` as any} />
```

**Why:** The typed router manifest only includes routes with matching `app/` screen files. Dynamically constructed paths need the cast until the route is registered.

**How to apply:** For any dynamic segment path or placeholder route in href/router.push, add `as any`.
