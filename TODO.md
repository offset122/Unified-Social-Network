# SocialApp (Vibe) — Missing, Incomplete & Enhancement TODO

> Audit of `artifacts/mobile` (33 screens, ~16.4k lines), verified against the code.
> Legend: ✅ Done (this pass) · 🟡 Partial / incomplete · ❌ Missing entirely · ⚠️ Bug
> Priority: 🔴 Critical → 🟠 High → 🟡 Medium → 🔵 Polish

---

## ✅ Completed (bugs & critical fixes — this pass)

Committed alongside `supabase/migrations/20260909_fixes_and_features.sql` + `supabase/functions/ai-proxy/`:

- **B1 Profile fields** — `location`/`pronouns` columns added to schema; `Profile` type now includes them; edit-profile loads saved values.
- **B2 Call ringing** — caller now rings `call-ring:{calleeId}` (the channel AppShell listens on) with callerId/name/avatar/type payload; decline broadcast ends the caller's screen; all four call entry points pass `peerId`.
- **B4 Auth-gated writes** — report action (and other guest-triggerable writes) bail through `AuthPromptModal`.
- **B6 Reports queue** — real `reports` table + RLS (insert = self, select/update = admins); `createReport`/`fetchReports`/`resolveReport` in db.ts; admin panel Moderation tab reads it; reporters no longer notify the offender.
- **B7 Real account deletion** — `delete_user()` security-definer RPC cascades posts/comments/messages/stories/etc. and deletes the auth user; settings wires it.
- **B8 (partial) Error surfacing** — critical flows now alert/report errors (reports, delete account).
- **C3 Typing indicators** — broadcast on the conversation channel, debounced local echo, "typing…" bubble in the message list.
- **C4 Live notifications** — `postgres_changes` subscription on the list screen + working **Mark all read** button.
- **C5 Reels pagination** — `onEndReached` incremental fetch keyed on oldest loaded id.
- **H2 Blocked filtering** — `fetchBlockedIds` (both directions) applied to feed, reels, and people-search results.
- **H4 AI proxy** — server-side Edge Function (`ai-proxy`) holds the OpenRouter key (`OPENROUTER_KEY` secret); client `callAI` routes through `supabase.functions.invoke` with direct-call fallback during migration. **Deploy + rotate the leaked key, then remove `EXPO_PUBLIC_OPENROUTER_KEY` (see H4).**
- **H7 Post owner menu** — edit-context actions on post detail: visibility toggle + delete (with confirm).
- **H10 Deep links** — share messages now include `https://vibe.app/post|reel|user/:id` URLs everywhere.
- **M2 (partial) About version** — settings About shows real `Constants.expoConfig.version`.
- **M1 Theme override** — 3-way System/Light/Dark picker in settings; persisted choice, and "System" returns to following the OS.

*(Corrections from the earlier audit: C2 realtime chat subscriptions and C6 Saved tab already existed — removed from TODO.)*

---

## ⚠️ Remaining Bugs

### B3. No WebRTC — video calls are simulations ⚠️
- Zero usage of `RTCPeerConnection` / `getUserMedia` / a WebRTC lib. Call screen is UI-only with Supabase broadcast signaling now in place (good foundation).
- **Fix:** integrate `react-native-webrtc` using the existing `call-signal-{chatId}` channel for offer/answer/ICE, or adopt a managed service (LiveKit / Daily / Stream).

### B5. Channel screen is a conversations spoof ⚠️
- `app/channel/[channelId].tsx` reads/writes `conversations`/`posts` — no `channels` or `channel_subscribers` table exists.
- **Fix:** add real channel tables + RLS, or rebrand the screen as "broadcast group".

---

## 🔴 Critical — Missing Core

### C1. Push notifications are not implemented ❌
- `expo-notifications` is installed and configured in `app.json`, but no `getDevicePushTokenAsync`, no `setNotificationHandler`, no token save, no server-side send. In-app realtime banners are the only notifications.
- **Build:** register token on login → store on profile → Edge Function sends on like/comment/follow/message/call. Needs Expo push credentials in env.

---

## 🟠 High — Incomplete Features

### H1. Schema drift & no migration history ⚠️
- Six ad-hoc SQL files + root vs. mobile duplicates. `supabase/migrations/` now exists with the fixes migration, but the legacy files haven't been consolidated.
- **Fix:** fold legacy SQL into a single baseline migration; run drift check against prod; delete redundant copies.

### H3. Live streaming has no real ingest ❌
- Host camera preview exists but no RTMP/WHIP ingest and viewers receive no video; `viewer_count` RPCs work.
- **Decide:** LiveKit / Stream / self-host; wire host publish + subscriber views.

### H4. (Follow-through) Rotate & retire the client AI key ⚠️
- The proxy is built, but `EXPO_PUBLIC_OPENROUTER_KEY` is still bundled until the Edge Function is deployed and the leaked key is **rotated** in OpenRouter. Also add per-user rate limiting in `ai-proxy`.

### H5. Media upload pipeline is fragile 🟡
- No compression before upload, no video thumbnails, no progress UI, no retry, no size guard; storage bucket policies unverified.
- **Build:** `expo-image-manipulator` for images, server-side transcode for video, upload progress state.

### H6. Search is shallow 🟡
- People + posts only; hashtag taps do nothing; no recent searches, no filters/sort.

### H8. (Follow-through) Notification preferences are cosmetic 🟡
- Settings toggles for likes/comments/follows exist but nothing reads them; wire them into the push/notification insert path when C1 lands.

### H9. Camera screen missing ❌
- Create tab uses library/camera pickers only; `expo-camera` installed but no in-app capture screen (filters/flash/flip/multi-shot).

---

## 🟡 Medium — Missing UX

- **M2 (rest).** Privacy rows are cosmetic toggles (no backend); Help URL is a `vibe.example.com` placeholder; Language row is a stub.
- **M3.** i18n absent — all strings hardcoded English.
- **M4.** Help/FAQ/Terms/Privacy pages missing (`expo-web-browser` available).
- **M5.** Onboarding flow missing — no interest picker, suggested-users carousel, or profile-completion prompt.
- **M6.** Comment likes & threading half-built — `likes_count` column unused, `parent_id` never rendered, no comment delete.
- **M7.** Hashtag system AI-only — no `hashtags` table, no tag pages, trending list is hardcoded.
- **M8.** Group admin features thin — no kick/mute enforcement UI, no invite links, single `is_admin` role.
- **M9.** Live sessions — no VOD/replay, no co-host, no live moderation.
- **M10.** No per-type notification digest/rollup ("Alice and 3 others") in the realtime banner.
- **M11.** Admin analytics thin — DAU only; no charts, user search, bulk actions, audit log.
- **M12.** Offline handling — no NetInfo; empty states shown when offline; no retry.
- **M13.** Accessibility — no labels/roles on icon-only buttons, no dynamic type.
- **M14.** Story enhancements — sticker tool is emoji-only (no drag placement), no music/link sticker, no story insights beyond seen-count.

---

## 🔵 Polish & Enhancements

- **P1 Performance** — no blurhash placeholders, no memoized post rows, reels list virtualization tuning.
- **P2 Skeleton loaders** — full-screen spinners remain on feed/profile/search.
- **P3 Avatar dedup** — inline Avatar code still duplicated across screens; `components/Avatar.tsx` not yet the single source.
- **P4 Global error handling** — remaining unwrapped Supabase calls still render as empty states.
- **P5 Tests & CI** — still zero test files; add unit tests for `lib/db.ts` helpers + a typecheck GitHub Action.
- **P6 AI UX** — AI follow-up chips static; no conversation memory in AI screens.
- **P7 Nice-to-haves** — voice/video notes, post scheduling/drafts, verification badges, account switcher, in-app changelog, AI follow suggestions, send-to-chat for posts.

---

## Deployment checklist (from this pass)

1. **Run the migration:** `supabase/migrations/20260909_fixes_and_features.sql` (profiles columns, `reports` + RLS, `delete_user` RPC).
2. **Deploy the Edge Function:** `supabase functions deploy ai-proxy` then `supabase secrets set OPENROUTER_KEY=...`.
3. **Rotate the OpenRouter key** (the old one shipped in client bundles) and remove `EXPO_PUBLIC_OPENROUTER_KEY` from `.env`.
4. Verify `https://vibe.app` domain + `vibe://` scheme hosting for shared links to resolve (H10 follow-through).
