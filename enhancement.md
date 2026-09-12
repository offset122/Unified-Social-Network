# Enhancement Plan — Reels, Post Cards & Post Detail (UI/UX)

> Scope: `app/(tabs)/reels.tsx` (ReelCard + pager + ReelComments), `app/(tabs)/index.tsx` (PostCard + feed chrome), `app/post/[postId].tsx`.
> Written from a line-by-line read of the current code. Every item names the file and behavior it changes.

---

## 🔴 P0 — High-impact fixes

### 1. Reels: volume never persists & mute state is lost between reels
**Where:** `ReelCard` (`reels.tsx`) — `isMuted` is per-card state, and the side-rail mute button toggles only the visible reel.
- Users expect a **global** mute preference (TikTok/IG persist the session preference, defaulting to muted on cellular).
- **Do:** hoist `isMuted` to `ReelsScreen` (or a small context) and pass down; persist to AsyncStorage so it survives app restarts. Show a one-time "Tap for sound" hint when unmuted-by-default.
- Bonus: add a **double-tap left/right edge to seek ±10s** — the tap handler already exists (`handleTap`), only seek logic is missing.

### 2. PostCard: optimistic like/save/share counts can drift from server
**Where:** `PostCard` (`index.tsx`) — `handleLike`, `handleShare`, `handleSave` mutate local state only; `handleShare` even writes `shares_count` **directly to the table** (`supabase.from("posts").update(...)`) instead of an RPC, so concurrent shares overwrite each other (lost updates).
- **Do:** move the share counter to an atomic `increment_post_shares` RPC (schema lives with the other SQL); on like/save use TanStack Query cache mutation so the card stays in sync when the same post appears in feed + profile + detail.
- Same direct-write anti-pattern in `ReelCard.handleShare` and `post/[postId].tsx` share handler.

### 3. Post detail: follow button is dead and like state ignores the feed state
**Where:** `post/[postId].tsx`
- The "Follow" chip in the author row is **not pressable** — it's a `View`, no `onPress`, no state. Tap does nothing.
- `isLiked`/`isSaved` are seeded from fresh DB reads in an effect, so a like made in the feed flashes back to unliked for ~1s (state not hydrated from React Query cache).
- **Do:** wire the follow button to `isFollowing` state (like PostCard's), seed `isLiked`/`isSaved` from `post.is_liked`/`post.is_saved` if the query provides them, and keep optimistic updates.

### 4. Reels: comment sheet has no auth gate and swallows errors
**Where:** `ReelComments` (`reels.tsx`)
- `submit()` returns silently for guests — the user taps send and **nothing happens**, no explanation.
- No error handling: network failure leaves the text in the box with the spinner stopping — no toast, no retry.
- **Do:** guests get `AuthPromptModal` ("Sign up to comment"); failures show an inline error with retry; disable send only while submitting (keep text).

### 5. Double-tap vs. single-tap adds a ~280ms play/pause delay
**Where:** `ReelCard.handleTap` — every pause toggle waits for the double-tap window to expire.
- **Do:** acceptable on mobile today; if it feels laggy, switch to `react-native-gesture-handler`'s `TapGestureHandler` with `numberOfTaps={2}` + a base handler, which fires single-tap immediately and cancels it on a second tap. Also add **long-press = 2× speed** preview (standard reel affordance) and **swipe down on a reel = close/return** feel via pager velocity tuning.

---

## 🟠 P1 — Strong enhancements

### 6. PostCard: no memoization — every like re-renders the whole feed
**Where:** `PostCard` (`index.tsx`) + FlatList `renderItem`.
- Each card holds its own optimistic state, so a like in card 3 re-renders every card. `renderItem` also creates a new closure per item, defeating `React.memo`.
- **Do:** extract PostCard to `components/PostCard.tsx` (also fixes the Avatar-dedup TODO), wrap in `React.memo`, pass `postId` + stable callbacks (`useCallback`) and read per-post state from the React Query cache. Add `getItemLayout`-friendly fixed heights where possible.

### 7. Feed: "For You" sorting is client-side and wipes pagination state
**Where:** `HomeScreen` `useEffect(feedMode)` — sorts only the **loaded page**, silently breaks cursor pagination (the cursor still points at the old last item), and re-sorts on every toggle.
- **Do:** fetch a server-side ranked feed (or a `foryou=true` param that orders by engagement score in SQL) so pagination works; otherwise sort a window of ±5 pages and keep the cursor for "latest" only. Show a small "sorted by engagement" caption so the mode isn't confusing.

### 8. Reels: only the visible reel preloads — jank between swipes
**Where:** `FlatList` `windowSize={5}` but `isVisible` is strictly `visibleIndex === index`, so neighbors are paused and unbuffered.
- **Do:** pass `isVisible={Math.abs(index - visibleIndex) <= 1 ? tabFocused : false}` (or an `isNearby` prop) so the next reel buffers while the current one plays. Keep `maxToRenderPerBatch={3}` and `initialNumToRender={2}`.

### 9. Reels: caption/hashtags are truncated to 3 lines with no expand
**Where:** `ReelCard` — `numberOfLines={3}`, no "more" affordance; hashtags get stripped from the caption so they never link anywhere (tapping does nothing — there's no tag page).
- **Do:** "…more" toggle to expand the caption; render hashtags as tappable chips (route to search `/search?q=%23tag` once tag pages exist — M7 in TODO.md). Hashtag-only captions currently render as an empty line; guard that.

### 10. PostCard media: video cells use native controls + CONTAIN (looks broken in feed)
**Where:** `PostCard` media block — feed videos render `useNativeControls` with `ResizeMode.CONTAIN` and a tiny corner play badge; on portrait videos this leaves black bars inside a rounded card.
- **Do:** match reels: tap-to-play fullscreen or inline with `COVER` + duration badge (e.g. `▶ 0:34`), no native controls in the feed. Add a poster frame (`usePoster`/first-frame) so cards don't flash black while buffering.

### 11. Post detail: comment input loses text on error and has no keyboard handling
**Where:** `post/[postId].tsx` — `submitComment` has no catch; input is a single-line `TextInput` with no `multiline`, so long comments are cut off; `KeyboardAvoidingView` isn't used, so on iOS the bar hides behind the keyboard.
- **Do:** multiline (max height), `KeyboardAvoidingView` wrapper, error toast + keep text on failure, and a char counter at 500+ chars if limits exist.

### 12. Reels: no buffering indicator and no error state per card
**Where:** `ReelCard` — `onLoadStart/onLoad` are unused; a slow network shows a frozen first frame with no spinner; a failed video shows the film-placeholder gradient silently.
- **Do:** track `isBuffering` via playback status; show a small centered spinner overlay; on load error show a retry chip on the card. Also gate `incrementPostViews` to fire **once per view** (currently fires on every `isVisible` flip, double-counting re-entries).

### 13. Feed: pull-to-refresh spinner misuses `isLoading`
**Where:** `HomeScreen` — `RefreshControl refreshing={isLoading && posts.length === 0}` means pull-to-refresh **never shows** on refresh (spinner only on the very first load), and `onRefresh` doesn't await `refetch`.
- **Do:** track a `isRefreshing` state set in `onRefresh` and cleared in a `.finally`, or use `isRefetching` from the query result.

### 14. Dark-mode: reels and post detail are theme-blind
**Where:** `reels.tsx` hardcodes `#18181b`/`#27272a` in `ReelComments` (fine for the dark player, but comment text colors ignore the theme), while post detail uses `colors.*` — two adjacent screens feel like different apps in light mode.
- **Do:** keep the immersive dark player (standard), but unify text/muted tokens via `useColors()` inside the sheet; same for the fullscreen video modals elsewhere.

---

## 🟡 P2 — Polish

### 15. Micro-interactions worth adding
- **Like button haptic** on feed + reels (`expo-haptics` is already installed, unused here): `Light` on tap, `Medium` on double-tap heart.
- **Save button**: brief scale-pop like the like button; currently only the color changes.
- **Share button**: rotate-and-settle animation on tap.
- **Card press state**: header avatar/name rows have no pressed feedback — add `opacity: 0.85` on `pressed` state via `Pressable` style fn.
- **Carousel dots**: animate width change (`Animated.View` inside each dot) instead of a hard swap.
- **Progress bar**: make it draggable (scrub) — currently it's display-only; at minimum, grow to 4px on touch.

### 16. Empty/loading states
- Feed initial load shows a bare `ActivityIndicator` below the story bar — replace with 3 **skeleton post cards** (matches P2 in TODO.md).
- Reels skeleton: shimmer gradient blocks in reel layout (avatar circle, caption bars, action circles).
- "Comments (0)" sheet: empty state text exists but add a subtle illustration/icon + "Be kind" hint.

### 17. Accessibility (M13 carry-over, specifics for these screens)
- All icon-only controls lack `accessibilityLabel`/`accessibilityRole`: like/save/share/mute/comment buttons (feed + reels), more (`…`) button, close (×) on the comment sheet, create (+) in reels header.
- Add `accessibilityState={{ selected }}` on the For You/Latest toggle and the profile tabs; `accessibilityLiveRegion` on like counts.
- Hit targets: side-rail circles are 50px (good), but feed action buttons are icon+text with no min-height — enforce 44×44 `hitSlop`.
- Dynamic type: caption/author text uses fixed sizes; test with large font scales.

### 18. Tablet/desktop layout for reels (web is first-class here)
- `REEL_HEIGHT = min(640, SCREEN_HEIGHT-100)` on web leaves the reel full-width on desktop — a letterboxed phone video stretched to a 1440px-wide column looks bad.
- **Do:** center a 9:16 column (max ~420px wide) on web/tablet with blurred ambient background (mirror the video with `blur`), like IG web. Feed already centers cards via `isTablet` — mirror that approach.

### 19. Consistency fixes
- Post detail saves via `Feather bookmark` (filled only) while feed/reels use Ionicons filled/outline pair — unify on Ionicons.
- Post detail's follow chip says just "Follow" with no followed state; reuse PostCard's `Follow/Following` pill.
- Reel comments use `@username` in purple; feed comments use display name — pick one (username) across both.
- Two different "caught up" footers (feed: lines+check; reels: plain text) — align styling.
- `Avatar` is re-implemented inline in `reels.tsx` and `post/[postId].tsx` (also flagged in TODO.md P3) — extract once, use everywhere.

### 20. Performance details
- PostCard image carousel renders full-size images for every page — use `expo-image` with `recyclingKey` + `placeholder` blurhash, and `cachePolicy` (also fixes P1 TODO).
- `ReelComments` re-fetches on every open — acceptable, but `staleTime: 30_000` avoids refetch flicker.
- Feed FlatList lacks `removeClippedSubviews` on web — enable except where it breaks carousels.
- Fire `incrementPostViews` from a single place (reels already does; detail never counts views — inconsistent analytics).

---

## Suggested order of attack
1. P0 #1–#4 (behavioral bugs users feel immediately)
2. P1 #6 (PostCard extraction + memo — unlocks #2's cache-based state properly)
3. P1 #8, #10, #12 (reels playback feel)
4. P1 #7, #13, #14 (feed correctness/theme)
5. P2 #15–#20 in any order, batching style-consistency items (#19) with the Avatar extraction.

## Notes
- All P0/P1 items keep the existing dark aesthetic; no redesign required — these are behavior/feel upgrades.
- Several items double as TODO.md progress: #6/#19 (P3 Avatar dedup), #16 (P2 skeletons), #17 (M13 a11y), #20 (P1 perf), #9 (part of M7 hashtags).
