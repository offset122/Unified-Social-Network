# SocialApp — Unified Social Network + Messaging MVP

A full-stack mobile social platform combining the social feed of Facebook with the messaging depth of Telegram.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/mobile run dev` — run the Expo app (web: port 18115, proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Mobile: Expo (React Native), expo-router v6, tab-based navigation
- API: Express 5 + Socket.IO
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Auth: Replit Auth + email/password (SecureStore key: `auth_session_token`)
- Storage: Replit Object Storage (env: `DEFAULT_OBJECT_STORAGE_BUCKET_ID`)

## Where things live

- `lib/db/src/schema/app.ts` — source of truth for DB schema (Drizzle)
- `lib/api-spec/openapi.yaml` — source of truth for API contracts (OpenAPI 3)
- `lib/api-client-react/src/generated/` — Orval-generated React Query hooks + Zod schemas (do not edit)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/mobile/app/(tabs)/` — 6-tab layout: Home, Search, Reels, Create, Messages, Profile
- `artifacts/mobile/app/` — additional screens: post/[postId], user/[userId], notifications, settings, live-sessions, etc.

## Architecture decisions

- Contract-first: always update `openapi.yaml` first, then run codegen, then implement routes and mobile screens.
- Socket.IO path: `/api/socket.io`; live rooms use `live:{sessionId}`.
- Media URLs: if path starts with `/objects/` → prepend `/api/storage`; prepend `BASE_URL` (`EXPO_PUBLIC_DOMAIN`).
- Post visibility enum: `"public"` | `"followers"` | `"private"` (default: `"public"`).
- StoryGroup type uses `user` field (not `author`) for the story author.
- useGetFeed / useGetStories / useGetUnreadNotificationCount all require explicit `queryKey` in their query options (Orval v8 requirement).

## Product

- **Home feed**: posts with media, likes, comments sheet, story bar, unread notification badge
- **Stories**: horizontal story bar with ring indicator for unviewed stories
- **Reels**: short-form video feed
- **Create post**: text + media, visibility picker (Public / Followers / Private), Post or Reel mode
- **Messages**: DMs + group channels
- **Profile**: own profile with post grid, view counts, settings sheet
- **User profile**: other users' profiles with follow/unfollow
- **Notifications**: rich per-type icons, mark-all-read
- **Live**: go live, view active live sessions, viewer count
- **Settings**: standalone settings screen

## User preferences

- Real backend only — no mock data anywhere.

## Gotchas

- Always run codegen after changing `openapi.yaml`: `pnpm --filter @workspace/api-spec run codegen`
- Dynamic route links in Expo Router require `as any` for non-registered typed paths (e.g. `/user/${id}` or `/change-password`).
- `GetUserPostsParams` only has `cursor`, not `limit`.
- `StoryGroup.user` not `StoryGroup.author` — the OpenAPI type uses `user`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
