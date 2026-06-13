---
name: Auth User type fields
description: The User type from useAuth() uses firstName/lastName/profileImageUrl, not displayName/avatarUrl.
---

The `User` interface in `artifacts/mobile/lib/auth.tsx` is:
```ts
interface User {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}
```

**Why:** This is the Replit Auth / session user shape, not the API's UserSummary shape (which has displayName/avatarUrl).

**How to apply:**
- Display name: `[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Me"`
- Avatar URL: `user?.profileImageUrl` (not `avatarUrl`)
- Do NOT use `user?.displayName` — it does not exist on this type.

The API's `UserSummary` type (returned by profile endpoints) DOES have `displayName` and `avatarUrl`. Only the auth context user uses firstName/lastName.
