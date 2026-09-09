# SocialApp (Vibe) — Missing, Incomplete & Enhancement TODO

> Fresh audit of `artifacts/mobile` (33 screens, ~16.4k lines), verified against the code.
> Legend: ✅ Working · 🟡 Partial / incomplete · ❌ Missing entirely · ⚠️ Bug or broken
> Priority: 🔴 Critical → 🟠 High → 🟡 Medium → 🔵 Polish

---

## ⚠️ Bugs & Broken Behavior (fix first)

### B1. Edit Profile saves columns that don't exist 🟠
- `app/edit-profile.tsx` writes `location` and `pronouns` to `profiles`, but neither column exists in any schema file (`supabase-schema.sql` only adds `website`). Every save with those fields populated fails or silently drops data.
- **Fix:** add `location TEXT` and `pronouns TEXT` columns to the schema, and add both fields to the `Profile` type in `lib/db.ts` (it currently lacks `website` too).

### B2. Call screen never notifies the callee 🟠
- `app/call/[chatId].tsx` broadcasts `call-ring` to channel `call:{chatId}` and listens on the *same* channel — but `app/_layout.tsx` listens on `call-ring:{user.id}`. The two never meet; incoming-call screen can't be triggered by a real call.
- **Fix:** unify the ring channel (e.g. caller sends `call-ring:{calleeId}` with caller name/avatar/chatId payload) and pass `callerName`/`callerAvatar` from the chat header.

### B3. No WebRTC — video calls are simulations 🟠
- Zero usage of `RTCPeerConnection` / `getUserMedia` / a WebRTC lib. Call screen is UI-only; TODO #5 "call controls" items like flip-camera toggle local state only.
- **Fix:** integrate `react-native-webrtc` + a signaling path (Supabase Realtime broadcast is already in place), or a managed service (LiveKit / Daily / Stream).

### B4. Guest users can still trigger authenticated writes 🟠
- `app/(tabs)/index.tsx` report action inserts notifications with `userId` that may be empty for guests; several screens assume `user.id` exists. Some guard with AuthPromptModal, some don't.
- **Fix:** single `requireAuth()` helper that shows `AuthPromptModal` and bails; audit all write actions.

### B5. Channel screen is a conversations spoof 🟠
- `app/channel/[channelId].tsx` reads/writes `conversations`/`posts` — there is no `channels` or `channel_subscribers` table anywhere. "Subscribe" toggles a conversation membership.
- **Fix:** either add real channel tables + RLS, or rebrand the screen as "broadcast group" and drop the channel terminology.

### B6. Report flow only notifies the offender 🟠
- "Report post" inserts a `report` notification **to the post author** (they get told they were reported) — no `reports` table exists, so moderation never sees it; admin panel has no report queue.
- **Fix:** add a `reports` table (reporter, post, reason, status) + admin queue UI.

### B7. Delete Account deletes the wrong rows 🟠
- `app/settings.tsx` deletes only from `profiles`; posts/comments/messages survive (FKs reference `profiles`, so deletion likely *fails* on RLS/FK anyway), and there's no `delete_user` RPC.
- **Fix:** Supabase `delete_user` security-definer RPC that cascades owned rows, then `signOut`.

### B8. AI chat + profile screens let RLS block legit queries silently
- Several screens `.select()` without error surfacing; failures render as empty states (e.g. notification list, search, profile stats).
- **Fix:** wrap queries with the shared error banner; log unexpected RLS errors.

---

## 🔴 Critical — Missing Core

### C1. Push notifications are not implemented ❌
- `expo-notifications` is installed and configured in `app.json`, but there is **no** `getDevicePushTokenAsync`, no `setNotificationHandler`, no token save, no server-side send (Supabase Edge Function / cron). In-app realtime banners are the only notifications.
- **Build:** register token on login → store on profile → Edge Function sends on like/comment/follow/message/call. Needs a push service key (Expo/FCM/APNs) in env.

### C2. Realtime in Chat doesn't exist — messages need manual refresh 🟠
- `app/chat/[chatId].tsx` has **no** `postgres_changes` subscription on `messages` for the open conversation (only reactions). Incoming messages appear only on refocus/refetch.
- **Build:** subscribe to `messages:conversation_id=eq.{id}` INSERT events; optimistic-send + reconcile.

### C3. Typing indicators, read receipts, presence ❌
- No typing broadcast, no `last_read_at` on `conversation_members`, no presence channel. Unread counts are the only signal.
- **Build:** `typing` broadcast on the conversation channel; `last_read_at` column + receipt UI; Supabase presence for online dots.

### C4. Notifications screen never live-updates 🟡
- Realtime banner works app-wide, but the notifications list itself is fetch-once React Query (no realtime in screen, no optimistic mark-read).

### C5. Reels feed has no pagination ❌
- `fetchReels` fetches 10 posts once; no `onEndReached` in `app/(tabs)/reels.tsx`. Feed has working pagination; reels goes blank after 10.

### C6. Saved-posts tab is dead in profile 🟠
- `fetchSavedPosts` exists and `profile.tsx` queries it, but the profile tabs don't include a "Saved" tab — users can save posts and never see them. (Also `toggleSavePost` has no UI entry point in the post actions row — verify.)

---

## 🟠 High — Broken / Incomplete Features

### H1. Schema drift & no migrations ⚠️
- Six ad-hoc SQL files (`SUPABASE_SCHEMA.sql`, `supabase-schema.sql`, `missing_tables.sql`, `fix_messaging.sql`, `message_reactions.sql`, `live_streams_enhanced.sql`) + root vs. mobile duplicates. No supabase/migrations dir.
- **Fix:** single migration sequence; run drift check against prod.

### H2. Blocked users are not filtered anywhere ⚠️
- `blockUser` writes a row; feed/search/messages still show blocked users' content. RLS `posts_select` shows all public posts to everyone.
- **Fix:** feed query `author_id not in (select blocked from blocks)`; hide profiles in search; block messaging.

### H3. Call screen lacks WebRTC + real callee flow (see B2/B3); live streaming has no real ingest ❌
- Live "camera preview" exists for the host, but no streaming backend (no RTMP/WHIP ingest, no viewers receiving video). Viewers see placeholder + chat only. `viewer_count` RPCs exist.
- **Decide:** livekit/self-host/Stream; wire host publish + subscriber views.

### H4. AI features ship the OpenRouter key in the client bundle ⚠️
- `EXPO_PUBLIC_OPENROUTER_KEY` is used directly from RN fetch — extractable from any build. 10 AI features depend on it.
- **Fix:** move to Supabase Edge Function proxy with key in server env; rate-limit per user. (Also replace `ai-chat` Alert toasts with the banner component.)

### H5. Media upload pipeline is fragile 🟡
- No compression before upload (quality 0.85 only), no video thumbnails, no progress UI, no retry, no size guard; `uploadMedia` infers content type from extension. Storage bucket policies unverified for `avatars`/`media`.
- **Build:** `expo-image-manipulator` for images, `ffmpeg-kit` or server-side transcode for video, upload progress state.

### H6. Search is shallow 🟡
- People (username/display) + posts (content) only. No hashtag feed (`#/tag` tap does nothing), no user suggestions when idle, no recent searches, no filters/sort, search bar focus bug (`searchRef.current?.focus()`).

### H7. Post detail is read-only for owners 🟡
- No edit, no delete from post detail (only delete in feed long-press), no visibility change on detail, no moderation menu. `updatePostVisibility` exists in db.ts with one caller in feed.

### H8. Notifications page: no mark-all-read action ❌
- List renders but no "mark all read" / per-item swipe actions; unread filter absent. (Icons map is now complete, incl. report/new_post/call types.)

### H9. Camera screen missing ❌
- Create tab opens library/camera pickers, but there's no in-app camera capture screen with filters/flash/flip/multi-shot; `expo-camera` is installed but unused in create flow.

### H10. Deep links & sharing are half-wired 🟡
- `scheme: "vibe"` exists; no universal domains configured; all `Share.share` messages omit URLs (profile/reel/post deep-link slugs don't resolve anywhere); `auth/callback` handles web redirect only.

---

## 🟡 Medium — Missing UX

### M1. Dark mode can't be forced 🟡
- Settings "Dark Mode" mirrors system only; `theme.tsx` supports `setTheme` but no override UI (Light/Dark/System picker) and no persistence.

### M2. Settings page has dead/misleading rows 🟡
- Privacy rows are cosmetic toggles (no backend), Help URL is `vibe.example.com` placeholder, About lacks version/build number (`expo-constants` available), Language row is a stub.

### M3. i18n absent ❌
- All strings hardcoded in English; no `expo-localization`/i18n infra. Settings has a "Language" row with no functionality.

### M4. Help & FAQ / Terms / Privacy pages missing ❌
- No in-app browser screens (`expo-web-browser` used for auth only) or static pages; settings/profile links dead-end.

### M5. Onboarding flow missing ❌
- New users land in an empty feed with just a WelcomeModal. No interest/topic picker, no suggested-users carousel, no profile-completion prompt (avatar/bio), no first-post nudge.

### M6. Comment likes & threading half-built 🟡
- `comments.likes_count` column exists; no like-comment UI, no nested replies rendering (`parent_id` unused in UI), no comment deletion from detail screen.

### M7. Hashtag system is AI-only 🟡
- Hashtags are extracted for AI suggestions; there's no `hashtags` table, no tag pages, no trending computation (search screen shows hardcoded trending list), no tag feed.

### M8. Group/channel admin features thin 🟡
- Group chat: no admin-only delete/kick UI beyond `chat-settings`; no invite links; no roles beyond single `is_admin`; no mute-duration enforcement.

### M9. Live sessions: no VOD, no co-host, no moderation 🟡
- No recording/replay, no live reports/mute for hosts, no live viewer list, stream quality selector absent; `AppState` viewer decrement is present.

### M10. Notifications: no digest or grouping enhancement beyond v1 🟡
- Grouping exists in list; no "Alice and 3 others" rollup in realtime banner, no notification preferences per type (settings toggles are cosmetic).

### M11. Admin panel lacks analytics depth 🟡
- Has DAU card; no charts (posts/day, signups), no user search, no bulk actions, no audit log of admin actions.

### M12. Offline / error states 🟡
- No NetInfo handling: screens show empty states when offline instead of "no connection" + retry. No optimistic queue for actions made while offline.

### M13. Accessibility 🟡
- No `accessibilityLabel`/`accessibilityRole` on icon-only buttons (tab bar actions, like buttons, overlays); no dynamic type support; color-only states (story rings).

### M14. Story enhancements 🟡
- Sticker tool has emoji picker only (no draggable sticker placement), no music tag, no link sticker, no story insights for own stories beyond seen-count.

---

## 🔵 Polish & Enhancements

### P1. Performance
- Feed images: no blurhash/thumbnail placeholder (`expo-image` supports it), no memory-cache tuning; PostCard re-renders on every like (no memoized rows); reels FlatList missing `windowSize`/`removeClippedSubviews` tuning; no ` FlatList` virtualization on chat message list (uses inverted FlatList, verify `getItemLayout`).
- Consider `react-query` `keepPreviousData` for search pagination.

### P2. Skeleton loaders
- Feed/profile/search still use `ActivityIndicator` full-screen; skeleton cards would improve perceived perf (carried over from old TODO — never done).

### P3. Avatar component dedup
- Inline `Avatar`-style code still duplicated across screens; `components/Avatar.tsx` exists but isn't the single source (carried over, still unfinished).

### P4. Global error handling
- Carried over: not all supabase calls are wrapped; empty states are indistinguishable from errors.

### P5. Tests & CI
- Zero test files despite jest config at repo root; add unit tests for `lib/db.ts` helpers (timeAgo, formatCount, resolveMediaUrl), auth mapping, notification mapping; GitHub Actions CI for typecheck (only CodeQL exists).

### P6. AI UX
- AI follow-up chips in `ai-chat.tsx` are static (carried over); AI caption/bio outputs have no regenerate-with-context memory; no AI moderation of reported content.

### P7. Nice-to-haves
- Voice/video notes in chat (`expo-av` recording UI absent)
- Post scheduling, drafts
- Profile verification badges
- Account switcher
- In-app changelog / feature announcements
- Follow suggestions ML/AI (currently "suggested" = recent chats)
- Send-to-chat for posts (post share → DM target picker)

---

## Notes
- Total: **~45 items** — 8 bugs, 6 critical, 10 high, 14 medium, 9 polish buckets.
- The previous TODO.md (40 items) was ~90% complete; the items above are what remains *plus* everything discovered in this deeper pass (push, realtime chat, WebRTC, saved tab, blocks filtering, migrations, i18n, onboarding).
