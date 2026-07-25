# SocialApp — Complete Feature & UI TODO

> Generated from full codebase analysis.
> Priority: 🔴 Critical (crashes / empty screens) → 🟠 High (broken features) → 🟡 Medium (missing UX) → 🔵 Low (polish)

---

## 🔴 CRITICAL — App-Breaking / Empty Screens

### 1. Group Chat Screen (`app/group/[groupId].tsx`)
- [x] Replace placeholder with full group chat UI (reuse chat bubble components from `chat/[chatId].tsx`)
- [x] Show group name, avatar, and member count in header
- [x] Add member list sheet (tap header to open)
- [x] Add group admin controls (rename, add/remove members, leave group)
- [x] Show group info: created by, created at, member count

### 2. Channel Screen (`app/channel/[channelId].tsx`)
- [x] Replace placeholder with a broadcast-style feed UI
- [x] Show channel posts/announcements in a scrollable list
- [x] Add "Subscribe / Unsubscribe" button for non-owners
- [x] Show subscriber count in header
- [x] Allow channel owner to post announcements
- [x] Add channel description and info sheet

### 3. Admin Panel (`app/admin.tsx`)
- [x] Wire up "User Management" → screen listing all users with ban/unban actions
- [x] Wire up "Content Moderation" → screen listing reported posts with approve/remove actions
- [x] Wire up "Analytics" → screen showing total users, posts, DAU stats from Supabase
- [x] Wire up "Reports" → screen listing all report notifications with resolution actions
- [x] Add admin badge/indicator in the header

### 4. Incoming Call Screen
- [x] Create `app/incoming-call.tsx` screen
- [x] Show caller name, avatar, call type (audio/video)
- [x] Add "Accept" (green) and "Decline" (red) buttons with animations
- [x] Trigger this screen via Supabase Realtime broadcast when `call-ring` event is received
- [x] Wire up from `_layout.tsx` AppShell to listen for incoming call broadcasts globally
- [x] Auto-dismiss after 30 seconds if not answered

---

## 🟠 HIGH — Broken / Non-Functional Features

### 5. Call Screen — Real Controls (`app/call/[chatId].tsx`)
- [x] Fix "Switch to audio/video" option — actually toggle `isVideo` state and update UI
- [x] Fix "Add person" option — navigate to `new-message` and pass back selected user to add to call
- [x] Remove the 3-second auto-answer demo timer (replace with real callee accept flow)
- [x] Add a "Flip camera" button for video calls
- [x] Show peer's video feed placeholder with their avatar when camera is off
- [x] Add call duration display that only starts when `callStatus === "connected"`

### 6. Live Streaming — Camera & Video (`app/live-sessions.tsx`)
- [x] Install `expo-camera` or replace `HostCameraPreview` with a proper camera component
- [x] Show a real camera preview for the host (front camera, mirrored)
- [x] Add mute mic button during live stream for host
- [x] Add flip camera button for host
- [x] Fix `endLiveBtn` position — replace `left: "50%"` + hardcoded `translateX` with `alignSelf: "center"`
- [x] Verify `increment_live_viewers` and `decrement_live_viewers` RPCs exist in Supabase schema; add them if missing

### 7. Post Share Button (`app/(tabs)/index.tsx`)
- [x] Implement share action on the share button in `PostCard`
- [x] Use React Native `Share.share()` with post content + deep link URL
- [x] Increment `shares_count` in DB after successful share
- [x] Show share count next to the share icon

### 8. Reels Share Persistence (`app/(tabs)/reels.tsx`)
- [x] Persist `sharesCount` increment to the `posts` table in DB after `Share.share()` resolves
- [x] Revert local count if the share is cancelled or fails

### 9. Post Detail — Like Icon (`app/post/[postId].tsx`)
- [x] Replace `Feather name="heart"` (always outline) with `AntDesign name={isLiked ? "heart" : "hearto"}` to match feed behavior
- [x] Apply red color `#ff3b5c` when liked, `colors.mutedForeground` when not
- [x] Add spring animation on like (same as feed PostCard)

### 10. Notifications — Report Type (`app/notifications.tsx`)
- [ ] Add `report` entry to `NOTIF_ICONS` map with `flag` icon and an orange/amber color
- [ ] Add `new_post` type to `NOTIF_ICONS` (currently unhandled)
- [ ] Add `audio_call` and `video_call` types to `NOTIF_ICONS`
- [x] Fix navigation for `audio_call` / `video_call` notification types (currently unhandled in `onPress`)

### 11. Change Password — Header (`app/change-password.tsx`)
- [x] Remove `Stack.Screen options={{ title: "Change Password" }}` (shows native header)
- [x] Add a custom header matching every other screen (back arrow + title + safe area padding)

### 12. Clipboard API (`app/ai-chat.tsx`)
- [x] Replace deprecated `Clipboard` import from `react-native` with `@react-native-clipboard/clipboard` or `expo-clipboard`
- [x] Update `handleCopy` to use `Clipboard.setStringAsync(text)` (async API)
- [x] Remove the `Alert.alert("Copied!")` — use a toast/snackbar instead for better UX

---

## 🟡 MEDIUM — Missing UX / Incomplete Flows

### 13. Home Feed — Story Viewed State (`app/(tabs)/index.tsx`)
- [x] Track which story groups the current user has fully viewed
- [x] Show grey ring (instead of gradient ring) on story avatars the user has already seen
- [x] Query `story_views` table to determine viewed status per group

### 14. Home Feed — Follow Button on Posts
- [x] Add a "Follow" button on posts from users the current user doesn't follow
- [x] Show "Following" state if already following
- [x] Optimistically update follow state and sync with DB

### 15. Search — Follow Button (`app/(tabs)/search.tsx`)
- [x] Add "Follow / Following" button on each user row in search results
- [x] Add "Follow / Following" button on suggested people cards
- [x] Optimistically update and sync with `followUser` / `unfollowUser` from `db.ts`

### 16. Reels — Follow Button (`app/(tabs)/reels.tsx`)
- [x] Add "Follow" button on the bottom-left author section of each reel
- [x] Hide it when viewing your own reel
- [x] Optimistically update follow state

### 17. Profile — "Message" Quick Action Fix (`app/(tabs)/profile.tsx`)
- [x] Replace `router.push("/(tabs)/messages")` with `getOrCreateDM(user.id, user.id)` — or better, remove the self-message button entirely
- [x] Replace with a "Share Profile" button that uses `Share.share()` with a profile deep link

### 18. Profile — Settings Dead Ends (`app/(tabs)/profile.tsx`)
- [x] Wire up "Help & FAQ" → open an in-app WebView or external URL
- [x] Wire up "About" → show app version, build number, and links to Terms/Privacy

### 19. Post Detail — Author Navigation (`app/post/[postId].tsx`)
- [x] Make the author row (avatar + name) tappable → navigate to `/user/${post.author_id}`
- [x] Add a "Follow" button next to the author name for non-own posts

### 20. User Profile — Share Profile (`app/user/[userId].tsx`)
- [x] Add a share icon button in the top-right header area
- [x] Use `Share.share()` with the user's display name and a profile link

### 21. Settings — Missing Sections (`app/settings.tsx`)
- [x] Add "Privacy" section: account visibility (public/private), who can message you
- [x] Add "Notifications" section: toggle push notifications per type (likes, comments, follows, messages)
- [x] Add "Language" row (placeholder for future i18n)
- [x] Add "Help & Support" row → external URL or in-app FAQ
- [x] Add "About" row → show version number, Terms of Service link, Privacy Policy link
- [x] Add "Delete Account" option (destructive, with confirmation) in a "Danger Zone" section

### 22. Edit Profile — Missing Fields (`app/edit-profile.tsx`)
- [x] Add "Website / Link" field (URL input with validation)
- [x] Add "Location" field (text input)
- [x] Add "Pronouns" field (text input or picker: he/him, she/her, they/them, custom)

### 23. Create Story — Text & Stickers (`app/create-story.tsx`)
- [x] Add a text overlay tool: tap to add text, choose color and font size
- [x] Add at least 4–6 sticker options (emoji picker or preset stickers)
- [x] Enforce 9:16 aspect ratio visually in the preview container
- [x] Add a "Discard" confirmation when pressing X with an asset selected

### 24. Story Viewer — Missing Interactions (`app/story-viewer.tsx`)
- [x] Add swipe-down gesture to dismiss the story viewer
- [x] Add press-and-hold to pause the story timer
- [x] Show "Seen by X people" for your own stories (query `story_views` count)
- [x] Add a "Delete story" option (three-dot menu) for your own stories

### 25. Notifications — Grouping & Filters
- [x] Add filter tabs at the top: "All", "Likes", "Comments", "Follows", "Messages"
- [x] Group similar notifications: "Alice, Bob, and 3 others liked your post"
- [x] Add swipe-to-dismiss on individual notifications

### 26. New Message — Suggested Contacts (`app/new-message.tsx`)
- [x] Show a "Suggested" list of recent contacts or followed users when search query is empty
- [x] Query recent conversations to populate suggestions

### 27. Blocked Users — Block from Screen (`app/blocked-users.tsx`)
- [x] Add a "Block someone" button in the header or as a floating action
- [x] Tapping it opens a user search to find and block a new user

### 28. Create Group — UI Polish (`app/create-group.tsx`)
- [x] Show a checkmark/filled circle on selected users instead of the faint opacity check
- [x] Add a group avatar picker (emoji or image) on the name step
- [x] Show selected member count in the "Next" button: "Next (3)"

### 29. Create Channel — Missing Fields (`app/create-channel.tsx`)
- [x] Add a "Description" field
- [x] Add a "Channel type" picker: Public / Private
- [x] Add a channel avatar/icon picker

---

## 🔵 LOW — Polish & Consistency

### 30. Tab Bar — Unread Badge on Messages Tab
- [x] Show a red dot/badge on the Messages tab icon when there are unread conversations
- [x] Query total unread count and pass it to `tabBarBadge` in `_layout.tsx`

### 31. Post Detail — Share Count
- [x] Display share count in the actions row alongside likes and comments

### 32. Feed — Empty State for New Users
- [x] When feed is empty and user follows nobody, show "Discover people to follow" CTA
- [x] Button navigates to the Search tab

### 33. Reels — Empty State
- [x] The current empty state is fine but add a "Browse posts" secondary CTA

### 34. Story Viewer — Pause on Input Focus
- [x] Already partially done (pauses on `onFocus`) but doesn't resume correctly after blur if text was typed — fix the `onBlur` logic to only resume if `replyText` is empty

### 35. Live Sessions — Viewer Count Accuracy
- [x] Decrement viewer count when the app goes to background or the user navigates away (use `AppState` listener)

### 36. Profile Cover Photo — Edit Shortcut
- [x] Add a camera icon overlay on the cover photo in the main profile screen (not just in edit-profile)
- [x] Tapping it navigates directly to `edit-profile` with the cover section pre-focused

### 37. AI Chat — Follow-up Suggestions Relevance
- [ ] Replace the hardcoded follow-up chips ("Tell me more", "Give examples", etc.) with dynamically generated ones based on the last AI response topic

### 38. Global — Avatar Component Deduplication
- [ ] The `Avatar` component is copy-pasted in 10+ files — extract it to `components/Avatar.tsx` (one already exists but isn't used everywhere)
- [ ] Update all screens to import from `@/components/Avatar`

### 39. Global — Error Handling
- [ ] Wrap all `supabase` calls in screens that don't have try/catch with proper error states
- [ ] Show user-friendly error messages instead of raw Supabase error strings

### 40. Global — Loading Skeletons
- [ ] Replace `ActivityIndicator` full-screen loaders on Feed, Profile, and Search with skeleton placeholder cards for better perceived performance

---

## 📋 Completion Checklist Summary

| # | Task | Priority | File(s) |
|---|------|----------|---------|
| 1 | Group chat UI | 🔴 | `group/[groupId].tsx` |
| 2 | Channel feed UI | 🔴 | `channel/[channelId].tsx` |
| 3 | Admin panel actions | 🔴 | `admin.tsx` |
| 4 | Incoming call screen | 🔴 | new file + `_layout.tsx` |
| 5 | Call screen controls | 🟠 | `call/[chatId].tsx` |
| 6 | Live camera & fixes | 🟠 | `live-sessions.tsx` |
| 7 | Post share action | 🟠 | `(tabs)/index.tsx` |
| 8 | Reels share persistence | 🟠 | `(tabs)/reels.tsx` |
| 9 | Post detail like icon | 🟠 | `post/[postId].tsx` |
| 10 | Notification types | 🟠 | `notifications.tsx` |
| 11 | Change password header | 🟠 | `change-password.tsx` |
| 12 | Clipboard API fix | 🟠 | `ai-chat.tsx` |
| 13 | Story viewed state | 🟡 | `(tabs)/index.tsx` |
| 14 | Feed follow button | 🟡 | `(tabs)/index.tsx` |
| 15 | Search follow button | 🟡 | `(tabs)/search.tsx` |
| 16 | Reels follow button | 🟡 | `(tabs)/reels.tsx` |
| 17 | Profile message fix | 🟡 | `(tabs)/profile.tsx` |
| 18 | Profile settings dead ends | 🟡 | `(tabs)/profile.tsx` |
| 19 | Post detail author nav | 🟡 | `post/[postId].tsx` |
| 20 | User profile share | 🟡 | `user/[userId].tsx` |
| 21 | Settings missing sections | 🟡 | `settings.tsx` |
| 22 | Edit profile fields | 🟡 | `edit-profile.tsx` |
| 23 | Story text & stickers | 🟡 | `create-story.tsx` |
| 24 | Story viewer interactions | 🟡 | `story-viewer.tsx` |
| 25 | Notification filters | 🟡 | `notifications.tsx` |
| 26 | New message suggestions | 🟡 | `new-message.tsx` |
| 27 | Block from blocked screen | 🟡 | `blocked-users.tsx` |
| 28 | Create group polish | 🟡 | `create-group.tsx` |
| 29 | Create channel fields | 🟡 | `create-channel.tsx` |
| 30 | Tab bar unread badge | 🔵 | `(tabs)/_layout.tsx` |
| 31 | Post detail share count | 🔵 | `post/[postId].tsx` |
| 32 | Feed empty state CTA | 🔵 | `(tabs)/index.tsx` |
| 33 | Reels empty state CTA | 🔵 | `(tabs)/reels.tsx` |
| 34 | Story viewer pause fix | 🔵 | `story-viewer.tsx` |
| 35 | Live viewer count accuracy | 🔵 | `live-sessions.tsx` |
| 36 | Profile cover edit shortcut | 🔵 | `(tabs)/profile.tsx` |
| 37 | AI chat dynamic follow-ups | 🔵 | `ai-chat.tsx` |
| 38 | Avatar component dedup | 🔵 | all screens |
| 39 | Global error handling | 🔵 | all screens |
| 40 | Loading skeletons | 🔵 | feed, profile, search |

---

**Total: 40 tasks — 4 Critical · 8 High · 17 Medium · 11 Low**
