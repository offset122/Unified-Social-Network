# Full-Stack Engineering & Security Audit — Vibe (`Unified-Social-Network`)

**Audit Scope:** Complete static and runtime review of repository configuration, Expo / React Native mobile & web client (`/artifacts/mobile`), static server (`/artifacts/mobile/server`), Supabase schemas/migrations/Edge Functions, CI/CD workflows, and dependencies.  
**Follow-Up Companion Docs:**  
- Security remediation trace & PoC checks: `/walkthrough.md`  
- Apple-caliber UI/UX redesign & product plan: `/ui-ux-plan.md`

---

## 1. Executive Summary

Vibe is an ambitious Expo Router (SDK 54 / React Native 0.81) + Supabase social platform combining feeds, short video reels, 24h stories, real-time DMs/groups/channels, notifications, live sessions, WebRTC-styled calls, an admin console, and OpenRouter AI helpers.

While the core client UI covers an impressive surface area, the codebase suffers from **critical security misconfigurations, multi-file database schema drift, unimplemented/stubbed real-time media transports, cross-platform upload bugs (notably Web & iOS `.jpg`/`.mov`), and stale repository scaffolding** left over from migrating off an earlier Express + Drizzle + Replit setup.

### Summary Scorecard

| Pillar | Pre-Audit State | Post-Audit State (This Pass) | Key Drivers |
| --- | --- | --- | --- |
| **Security & Secrets** | **Critical Risk** | **Hardened in Code + Migration Staged** | Removed `EXPO_PUBLIC_*` private keys & client OpenRouter calls; patched Reflected XSS, Host injection & path traversal in `serve.js`; added CORS + validation to `ai-proxy`; staged `20260915_security_hardening.sql` for RLS/RPC privilege escalation. |
| **Database & Migrations** | **Fragmented** | **Consolidated Plan Ready** | 7+ conflicting SQL files; missing `story_views`, `live_likes`, `avatars` bucket, and `conversations` columns; open RLS inserts and unguarded `SECURITY DEFINER` RPCs. |
| **TypeScript & Tests** | **Broken (`TS2304`, Jest fail)** | **Typecheck Green + 5 Security Tests Pass** | Fixed `bootLog.ts` `globalThis` TS error (`tsc --noEmit` now exits `0`); added `serve.test.js` (5/5 pass). Root `npm test` still fails on orphaned CRA template. |
| **Core Features & UX** | **Partial / Mixed** | **Audit Complete + UI/UX Plan Written** | Live video & WebRTC calls are UI simulations; Chat translation bug, `/search?q=` param ignore, `fetchRankedFeed` guest error, Web `data:`/`blob:` upload failure, and `chat-media` Links bug remain open to fix next. |
| **Repo & CI/CD Hygiene** | **Stale** | **Documented** | Root `App.js`, `replit.md`, `create-react-app/`, `mockup-sandbox/`, unused packages, and broken GitHub deploy workflow. |

---

## 2. Remediations Completed & Verified in This Audit Pass

Before finalizing this report, verified security and compile blockers in application code were fixed and tested directly:

1. **Static Server XSS, Host Header Injection & Path Traversal (`artifacts/mobile/server/serve.js`, `landing-page.html`):**
   - Replaced raw `Host` / `X-Forwarded-Host` / `X-Forwarded-Proto` header interpolation with strict `sanitizeProtocol()` + RFC `HOST_REGEX` (`sanitizeHost()`), HTML escaping (`escapeHtml()`), and `JSON.stringify` deep-link injection (`EXPS_DEEP_LINK_JSON_PLACEHOLDER`).
   - Fixed `STATIC_ROOT` prefix bypass by enforcing `filePath === rootResolved || filePath.startsWith(rootResolved + path.sep)` plus `decodeURIComponent` error handling and null-byte rejection.
   - Wrapped `new URL(...)` in `try/catch` to prevent missing/malformed `Host` crashes; added `X-Content-Type-Options: nosniff` and `Referrer-Policy` headers.
   - **Verified:** `node --test artifacts/mobile/server/serve.test.js` (5/5 passed) + headless Chromium check on `http://localhost:3000` (0 console errors).
2. **Client-Side AI Secret Removal & Edge Function Hardening (`.env.example`, `artifacts/mobile/lib/db.ts`, `artifacts/mobile/supabase/functions/ai-proxy/index.ts`):**
   - Removed `EXPO_PUBLIC_OPENROUTER_KEY` and `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE` from `.env.example`.
   - Removed direct client OpenRouter fallback in `callAI()` and migrated `chatWithAI()` from direct client OpenRouter calls to `${SUPABASE_URL}/functions/v1/ai-proxy` with JWT + `apikey` headers.
   - Upgraded `ai-proxy/index.ts` with origin-checked CORS (`ALLOWED_ORIGINS` + localhost dev), `OPTIONS` preflight, multi-turn `messages` validation, `is_banned` checks, and stale-entry rate-limit pruning.
3. **Moderation Queue & Reporting Alignment (`artifacts/mobile/app/admin.tsx`, `artifacts/mobile/app/user/[userId].tsx`, `lib/db.ts`):**
   - Switched `admin.tsx` `ContentModeration` from broken `notifications` queries to `fetchReports()` / `resolveReport()` with error alerts on ban/delete failures.
   - Switched `user/[userId].tsx` `submitReport` from inserting `'report'` into `notifications` (which violated the schema check constraint and notified the reported user) to `createReport(user.id, null, reason, ...)`.
4. **TypeScript Build Fix (`artifacts/mobile/lib/bootLog.ts`):**
   - Replaced `(global as any).ErrorUtils` with `(globalThis as any).ErrorUtils`, resolving `error TS2304`. `npx --prefix artifacts/mobile tsc -p artifacts/mobile/tsconfig.json --noEmit` now exits `0`.
5. **SQL Security Hardening Migration Created (`artifacts/mobile/supabase/migrations/20260915_security_hardening.sql`):**
   - Staged idempotent SQL fixes for all RLS, trigger, RPC, missing table, and storage bucket gaps below (must be executed in Supabase SQL Editor).

---

## 3. Security & Privacy Findings (Remaining Action Items)

### Critical — Requires Running `20260915_security_hardening.sql` & Key Rotation
1. **Rotate Exposed Keys Immediately:** Any `EXPO_PUBLIC_OPENROUTER_KEY` or `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE` previously set in `.env`, EAS secrets, or Vercel/Netlify builds must be assumed compromised and rotated. Only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` belong in client bundles; `OPENROUTER_KEY` belongs exclusively in `supabase secrets set`.
2. **`profiles` Privilege Escalation (`supabase-schema.sql:423`):** `"Users can update their own profile"` had no column guard on `is_admin`, `is_banned`, or counter columns (`followers_count`, `following_count`, `posts_count`). Any user could self-promote to admin via Supabase REST API. Addressed in `20260915_security_hardening.sql` via `protect_profile_privileged_columns()` trigger.
3. **Open `conversation_members` & `notifications` Inserts (`fix_messaging.sql:31`, `missing_tables.sql:130`, `supabase-schema.sql:487`):** `WITH CHECK (true)` lets any caller join arbitrary private DM/group conversations or forge notifications to any user. Fixed in `20260915_security_hardening.sql`.
4. **Missing Admin RLS Policies (`supabase-schema.sql:423,429`):** Previously, `profiles` `UPDATE` and `posts` `DELETE` only permitted `auth.uid() = id/author_id`, meaning `admin.tsx` ban and post-removal actions silently failed under RLS. Fixed in `20260915_security_hardening.sql`.

### High — Authorization, RPCs & Realtime
5. **Unguarded `SECURITY DEFINER` RPCs (`supabase-schema.sql:239-348`, `live_streams_enhanced.sql:72-122`, `20260912_feed_ui_enhancements.sql:24-46`):**
   - `upsert_live_viewer`, `remove_live_viewer`, `accept_join_request`, `reject_join_request`, `get_dm_conversation`, `get_dm_other_user`, and `fetch_ranked_feed` lacked `SET search_path = public` and `auth.uid()` / host / membership validation. Hardened in `20260915_security_hardening.sql`.
   - Counter RPCs (`increment_post_likes`, `decrement_post_likes`, `increment_post_comments`, `increment_post_shares`, `increment_followers`, etc.) remain directly callable by clients; long-term best practice is replacing them with Postgres `AFTER INSERT/DELETE` triggers so counters cannot be spoofed.
6. **`delete_user()` Orphaned Auth Records (`20260909_fixes_and_features.sql:51-73`):** Deletes `public.profiles` and cascades app tables, but does **not** delete `auth.users` (which requires a Supabase Edge Function using `SUPABASE_SERVICE_ROLE_KEY` via `supabase.auth.admin.deleteUser`). Users can still authenticate with an existing session/password without a profile row.
7. **`blocks` Enforcement & `followers` Post Visibility (`supabase-schema.sql:426`):** `posts` `SELECT` RLS ignored `'followers'` visibility completely (`visibility = 'public' OR author_id = auth.uid()`) and did not block `blocks` pairs at the DB layer (`getOrCreateDM`, comments, stories, and `call-ring:{calleeId}` broadcast channels were also unblocked). Fixed at `posts` and `notifications` RLS level in `20260915_security_hardening.sql`.
8. **Group Admin UI/DB Mismatch (`app/group/[groupId].tsx:236`, `missing_tables.sql:114-120`):** `group/[groupId].tsx` computes `isAdmin` as `(members as Profile[]).some(m => m.id === user?.id)` (treating *every* group member as an admin!), and `missing_tables.sql` allowed any member to update conversation metadata.
9. **Unauthenticated Realtime Call Broadcasts (`app/_layout.tsx:79-91`):** Any client can broadcast to `call-ring:${targetUserId}` without verifying shared conversation membership or caller identity.

---

## 4. Database Schema Drift & Migration Chaos

The repository currently contains **9 competing SQL files**:
- Root: `/SUPABASE_SCHEMA.sql`, `/supabase_schema.sql`, `/fix_messaging.sql`, `/missing_tables.sql`, `/live_streams_enhanced.sql`, `/message_reactions.sql`
- Mobile: `/artifacts/mobile/supabase-schema.sql`, `/artifacts/mobile/supabase/migrations/20260909_fixes_and_features.sql`, `/artifacts/mobile/supabase/migrations/20260912_feed_ui_enhancements.sql` (plus newly added `20260915_security_hardening.sql`)

Verified runtime mismatches between client code (`lib/db.ts`, screens) and `artifacts/mobile/supabase-schema.sql`:
- **Missing tables:** `story_views` (used by `story-viewer.tsx:58-62`), `live_likes` (used by `db.ts:661-672`), `message_reactions` (defined only in root `message_reactions.sql`).
- **Missing bucket:** `avatars` storage bucket (used by `db.ts:584` and `edit-profile.tsx:75`) missing from `supabase-schema.sql:515-528`.
- **Missing columns:** `conversations.description` and `conversations.is_private` inserted by `create-channel.tsx` do not exist in `artifacts/mobile/supabase-schema.sql`; `profiles.push_token` referenced in `lib/notifications.ts` does not exist.
- **Check constraint mismatch:** `notifications.type` allows only `('follow','like','comment','reply','message','mention','live','save')`, whereas app code/types also use `'audio_call'`, `'video_call'`, `'new_post'`, etc.

**Recommendation:** Establish `/artifacts/mobile/supabase/migrations/` as the single source of truth using Supabase CLI migrations and archive/remove the 6 legacy root `.sql` files.

---

## 5. Functional Bugs & Incomplete Features (Screen-by-Screen)

### High-Impact Bugs
1. **Chat Message Translation Always Disappears (`artifacts/mobile/app/chat/[chatId].tsx:497, 941-951`):** `translateMessage` sets `translatingMsgId(msg.id)`, saves `translatedText`, and resets `setTranslatingMsgId(null)` in `finally`. The JSX checks `translatingMsgId === msg.id && !!translatedText`—always `false` once translation finishes! Separate `translatingMsgId` (spinner) from `translatedMsgId` (display).
2. **All Media Uploads Fail on Web & `.jpg`/`.mov` Files (`lib/db.ts:585-608`, `edit-profile.tsx:74-80`, `create-story.tsx:65`):**
   - `uploadMedia` rejects URIs not starting with `file://`, `content://`, `http://`, or `https://`—breaking **all Web image/video uploads** (`expo-image-picker` returns `data:` or `blob:` URIs on Web).
   - `edit-profile.tsx` constructs `image/${ext}` (`image/jpg`) and `create-story.tsx` constructs `video/mov`, both rejected by `ALLOWED_MIME_TYPES` (`image/jpeg`, `video/quicktime`).
3. **Guest Crash on "For You" Feed (`lib/db.ts:185`, `app/(tabs)/index.tsx`):** Calling `fetchRankedFeed("")` when signed out passes an empty string `""` for `p_user_id uuid`, throwing Postgres `invalid input syntax for type uuid: ""`. Pass `null` when signed out.
4. **Hashtag Navigation Ignored (`app/(tabs)/reels.tsx:422` → `app/(tabs)/search.tsx`):** Tapping a `#tag` navigates to `/search?q=%23tag`, but `search.tsx` never calls `useLocalSearchParams<{ q?: string }>()` so the search bar opens blank.
5. **Channel Creation Inserts Non-Existent Columns & Global Posts (`app/create-channel.tsx`, `app/channel/[channelId].tsx`):** Inserts `description` and `is_private` on `conversations`; channel posts write to public `posts` (showing up in the global home feed); subscriber count is hardcoded `0`.
6. **`chat-media/[chatId].tsx` Links Tab Always Empty (`lines 32-49`):** Query filters `.not("media_url", "is", null)`, then `Links` filters `!m.media_url && m.content?.match(/https?:\/\//)`—mutually exclusive! Also the Files download icon is not interactive.

### Medium-Impact Bugs & Stubs
7. **Live Streaming & Calls Are Non-Media Simulations (`app/live-sessions.tsx`, `app/call/[chatId].tsx`, `app/incoming-call.tsx`):** Zero WebRTC (`RTCPeerConnection` / `getUserMedia`) or HLS/RTMP transport; viewers see gradient avatar cards; `joinLiveSession` increments `viewers_count` even on duplicate joins and leaves phantom counts on force-quit.
8. **Auth & Onboarding Gaps (`app/login.tsx:313,394`, `lib/auth.tsx:140-165`):**
   - `"Forgot password?"` button in `login.tsx` has no `onPress` handler.
   - `lib/auth.tsx` exposes a no-op `login: async () => {}` stub; `registerWithEmail` passes `first_name`/`last_name`/`display_name` metadata while `handle_new_user()` reads `full_name`/`name`, and ignores errors from client-side `profiles.upsert`.
9. **Settings & Notifications Gaps (`app/settings.tsx`, `app/(tabs)/profile.tsx`, `app/notifications.tsx`):**
   - Duplicate Settings UIs (`settings.tsx` vs `profile.tsx` `SettingsSheet`) with conflicting domain/version text (`vibe.app` vs `vibe.example.com`).
   - All 5 notification/privacy toggles in `settings.tsx:20-24` are ephemeral `useState` (never persisted); Language selector is static.
   - `lib/notifications.ts` (`savePushToken`, `sendPushNotification`) is never imported or called anywhere; `notifications.tsx` duplicates `db.ts` notification logic and looks up follows by `username` instead of `actor_id`.
10. **Cross-Platform & Minor UI Bugs:**
    - `app/group/[groupId].tsx:229`: `Alert.prompt` is iOS-only (silently no-ops on Android and Web).
    - `app/(tabs)/reels.tsx:230`: Double-tap likes without checking `user?.id` auth guard.
    - `app/(tabs)/search.tsx:155`: Passes `searchUsers(query)` without `user?.id`, leaking blocked users in search.
    - `app/create-channel.tsx:21`: Duplicate `"📡"` emoji in `channelIcons` causes React duplicate key warning.
    - `app/blocked-users.tsx:48`: Empty-state copy says `"Type at least 2 characters"` even when a 2+ char search returns zero matches.
    - `app/user/[userId].tsx:289-302`: Visibility change / delete on user profile grid doesn't invalidate `["user-posts"]` React Query cache.

---

## 6. Architecture, Repository Hygiene, Build & CI/CD

### Repository Drift & Dead Code
- **Misleading Root Documentation & Config:** `replit.md`, root `tsconfig.json`, and `pnpm-workspace.yaml` describe a full-stack Express 5 + Drizzle + PostgreSQL + Socket.IO + OpenAPI/Orval workspace (`lib/db`, `lib/api-client-react`, `artifacts/api-server`) that no longer exists.
- **Conflicting Entrypoints:** Root `/App.js`, `/app.json`, `/index.js`, and `/babel.config.js` conflict with the real application in `/artifacts/mobile/`.
- **Orphaned Projects:** `/artifacts/mobile/create-react-app/` (an unused CRA boilerplate inside the mobile directory) and `/artifacts/mockup-sandbox/` (unused Shadcn/Vite sandbox).
- **Broken Root Test Script:** `npm test` runs `jest` at root, which picks up `/artifacts/mobile/create-react-app/src/App.test.js`, transforms it with root `babel.config.js` (`babel-preset-expo`), and fails with `Cannot find module 'babel-preset-expo'`.
- **Unused Dependencies in `artifacts/mobile/package.json`:** `socket.io-client`, `@hcaptcha/react-native-hcaptcha`, `expo-location`, `zod`, and `zod-validation-error` have **zero** imports anywhere in `/artifacts/mobile/`.
- **Broken GitHub Actions Workflow (`.github/workflows/deploy-web.yml`):** Uses Node 18, `npm ci`, deprecated global `expo-cli`, and `./dist` at root—none of which match `/artifacts/mobile/` or current Expo SDK 54 (`npx expo export -p web`). `codeql.yml` is configured cleanly for JS/TS.

---

## 7. Prioritized Action Roadmap

| Priority | Track | Action Items | Effort |
| --- | --- | --- | --- |
| **P0 (Immediate)** | **Security & DB** | 1. Execute `/artifacts/mobile/supabase/migrations/20260915_security_hardening.sql` in Supabase SQL Editor.<br>2. Deploy updated `ai-proxy` (`supabase functions deploy ai-proxy`) and set `OPENROUTER_KEY` + `ALLOWED_ORIGINS` secrets.<br>3. Rotate any previously exposed OpenRouter / Supabase service-role keys. | 1–2 hrs |
| **P1 (This Sprint)** | **Core Reliability** | 1. Fix `uploadMedia` for Web `data:`/`blob:` URIs and normalize `.jpg`→`image/jpeg`, `.mov`→`video/quicktime`.<br>2. Fix `chat/[chatId].tsx` `translatedMsgId` state, `fetchRankedFeed(null)` guest bug, `search.tsx` `q` param hydration + `viewerId` block filter, and `chat-media` Links query.<br>3. Implement `"Forgot password?"` reset flow in `login.tsx` and Edge Function `delete-account` calling `auth.admin.deleteUser`. | 1–2 days |
| **P2 (Next Sprint)** | **Repo & CI Cleanup** | 1. Archive/remove root `App.js`, `create-react-app/`, duplicate `.sql` files, and unused packages (`socket.io-client`, `@hcaptcha/react-native-hcaptcha`, `expo-location`, `zod`).<br>2. Fix `.github/workflows/deploy-web.yml` to build `artifacts/mobile` with Node 20 + `npx expo export -p web`.<br>3. Add CI checks running `tsc --noEmit` and `node --test artifacts/mobile/server/serve.test.js`. | 1 day |
| **P3 (Product & UI)** | **Apple-Grade UX** | Execute Phases 1–4 of `/ui-ux-plan.md` (5-tab consolidation, design tokens, `ActionSheet`/`PromptSheet` replacing `Alert.prompt`, unified Settings, contextual AI, motion/haptics, VoiceOver & desktop web layout), and decide on real WebRTC/LiveKit integration vs. audio-only/stage framing for Calls & Live Sessions. | 1–2 weeks |
