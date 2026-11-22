# Vibe Social Network — Apple-Caliber UI/UX Design & Engineering Plan

**Prepared from:** Full-stack codebase inspection of `/artifacts/mobile`  
**Design Standard:** Apple Human Interface Guidelines (Clarity, Deference, Depth) adapted for Expo / React Native (iOS, Android, and Web)

---

## 1. Executive Design Critique (Current State vs. Target Bar)

Vibe already has broad surface coverage (Feed, Reels, Search, Create, Messages, Live Sessions, Calls, Stories, AI Assistants, Profile, Settings, Admin), light/dark theme support (`lib/theme.tsx`, `constants/colors.ts`), and custom brand assets. However, as an integrated product, the UI currently feels assembled feature-by-feature rather than designed as one cohesive system:

| Current Friction | Root Cause in Codebase | Apple-Grade Target Experience |
| --- | --- | --- |
| **Visual inconsistency across screens** | Local inline `Avatar` components duplicated in `admin.tsx`, `user/[userId].tsx`, and others despite `components/Avatar.tsx` existing; ad-hoc hardcoded `#7c3aed` hex strings alongside `useColors()`. | Single source-of-truth design tokens (`surfacePrimary`, `surfaceElevated`, `vibrantAccent`, `separator`) and one shared `Avatar` + `Button` + `Sheet` primitive library. |
| **System `Alert.alert` used as navigation/menus** | Multi-option actions (`user/[userId].tsx`, `admin.tsx`, `create.tsx`, `profile.tsx`) and iOS-only `Alert.prompt` (`group/[groupId].tsx`) interrupt flow with blocking native dialogs. | Fluid, thumb-reachable **Bottom Action Sheets** (`@gorhom/bottom-sheet` or native-feel spring sheet) with icons, destructive confirmation states, and cross-platform inline text inputs. |
| **Duplicate & contradictory Settings UX** | Full-screen `app/settings.tsx` coexists with an inline `SettingsSheet` modal inside `app/(tabs)/profile.tsx` showing different app metadata (`vibe.app` vs `vibe.example.com`) and non-persisted toggles (`useState`). | Single canonical `settings.tsx` hierarchy grouped like iOS Settings (Account, Privacy & Safety, Notifications, Appearance, Data & Diagnostics) with persisted preferences. |
| **Floating AI button clutter** | `components/AIFloatingButton.tsx` floats over primary content and tab bars, competing with scroll gestures and compositing controls. | **Contextual Inline Intelligence**: subtle shimmer triggers embedded where intent naturally occurs (caption field, reply bar, search bar, bio editor) + a clean entry point in Messages/Explore. |
| **Broken cross-screen continuity** | Tapping `#tag` in `reels.tsx` pushes `/search?q=...` (`search.tsx` ignores URL params); `chat/[chatId].tsx` translation disappears on completion; `chat-media/[chatId].tsx` Links tab is always empty; Web media uploads fail on `data:`/`blob:` URIs. | Zero dead ends: stateful deep-link params, persistent inline translation pills, live link previews, and universal media picking across iOS/Android/Web. |
| **Uncoordinated motion & haptics** | Some buttons use `Animated` springs while others snap abruptly; `expo-haptics` is applied unevenly; no `Reduce Motion` respect. | Unified spring physics (`damping`/`stiffness` presets), deliberate haptic grammar, and automatic `AccessibilityInfo.isReduceMotionEnabled()` fallback. |

---

## 2. Apple Design Principles Applied to Vibe

1. **Deference (Content First):** Social media photography, Reels video, and live conversations are the hero. Chrome—headers, tab bars, borders, and AI controls—must recede into translucent layers (`expo-blur` on iOS/Web, high-opacity scrims on Android) so content occupies the maximum viewport.
2. **Clarity (Scannable Hierarchy):** Every screen needs one unmistakable primary action, crisp typographic contrast (Dynamic Type scale + tabular numerals for engagement metrics and call timers), and generous whitespace (16pt screen margins, 12pt card gutters).
3. **Depth (Spatial Continuity):** Modals, story viewers, photo lightboxes, and action sheets should communicate *where they came from* using continuous corner radii (`borderCurve: "continuous"`), layered elevation, and predictable interactive dismissals (drag down to dismiss stories/media, swipe back on stacks).

---

## 3. Information Architecture & Navigation Overhaul

### Primary Tab Bar (`app/(tabs)/_layout.tsx`)
Keep the 5-tab structure, refined for muscle-memory parity and zero crowding:
1. **Home (`index.tsx`)** — Following / For You segmented pill in a translucent collapsing header + Stories tray.
2. **Explore (`search.tsx`)** — Instant search bar + Trending Topics + Bento discovery mosaic (photos, reels, creators).
3. **Create (`create.tsx`)** — Elevated center composer launcher presenting a unified **Create Sheet** (Post, Reel, Story, Go Live) rather than an awkward intermediate tab screen when users want to jump straight into Stories or Live.
4. **Reels (`reels.tsx`)** — Full-bleed edge-to-edge vertical video stage (`tabBarStyle` switches dynamically to translucent dark glass on Reels so light-mode users aren't blinded by a white bar under dark video).
5. **Messages (`messages.tsx`)** — Unified Inbox with segmented filter (`All`, `Unread`, `Groups`, `Channels`) and clean unread badge counts.
*(Profile moves to a persistent top-right or top-left Avatar button in the Home/Explore headers—OR keep Profile as the 5th tab and place Search/Explore cleanly in Home/Reels top bar or keep 5 tabs `[Home, Explore, Reels, Messages, Profile]` with a floating/header `+` Create trigger! Let's evaluate: Instagram/Apple-style 5-tab `[Home, Search, +, Reels, Messages]` currently pushes `Profile` onto the tab bar instead of `Create` or `Messages` — wait: currently `_layout.tsx` has 6 tabs! Home, Search, Create, Reels, Messages, Profile!)*

> **Critical IA Fix:** `app/(tabs)/_layout.tsx` currently defines **6 tabs** (`index`, `search`, `create`, `reels`, `messages`, `profile`), which compresses hit targets on narrow phones (<375pt) and violates iOS 5-tab maximum ergonomics.  
> **Recommendation:** Consolidate to **5 primary tabs**: `Home`, `Explore`, `Reels`, `Messages`, `Profile` — and launch **Create** via a crisp `+` glass button in the Home/Profile/Reels header (or a modal composer route `/create`), freeing 20% more horizontal breathing room in the tab bar!

### Unifying Modal & Sheet Patterns
- Replace all multi-option `Alert.alert(...)` action lists and iOS-only `Alert.prompt(...)` (`group/[groupId].tsx:229`) with one shared `<ActionSheet />` + `<PromptSheet />` component built with safe-area padding, keyboard avoidance, and hardware back support.
- Remove the duplicate `SettingsSheet` inside `app/(tabs)/profile.tsx` and link the gear icon directly to `app/settings.tsx`.

---

## 4. Visual Design System & Token Specification

Upgrade `constants/colors.ts` and `lib/theme.tsx` into a structured 3-tier token architecture:

### A. Surface & Color Semantics (Light & OLED Dark)
| Token | Light Mode | Dark Mode (OLED-Tuned) | Usage |
| --- | --- | --- | --- |
| `bgCanvas` | `#FFFFFF` | `#000000` | Root scroll canvas, Reels/Media backdrop |
| `bgElevated` | `#F7F7FA` | `#121216` | Grouped cards, composer boxes, settings groups |
| `bgMaterial` | `rgba(255,255,255,0.82)` | `rgba(18,18,22,0.82)` | Translucent headers, tab bar (`BlurView` intensity 75) |
| `bgOverlay` | `rgba(0,0,0,0.45)` | `rgba(0,0,0,0.65)` | Sheet backdrops, video controls scrim |
| `textPrimary` | `#0B0B0F` | `#F5F5F7` | Headlines, post copy, usernames (WCAG > 14:1) |
| `textSecondary` | `#63636B` | `#9A9AA6` | Timestamps, metadata, captions (WCAG >= 4.6:1) |
| `separator` | `rgba(60,60,67,0.12)` | `rgba(255,255,255,0.12)` | Hairline dividers (`StyleSheet.hairlineWidth`) |
| `accentPrimary` | `#6D28D9` | `#8B5CF6` | Primary CTAs, active tabs, unread badges |
| `accentTint` | `rgba(109,40,217,0.10)` | `rgba(139,92,246,0.16)` | Selected chips, subtle AI triggers |
| `semanticDanger` | `#E11D48` | `#FB7185` | Like hearts, destructive actions, live pill |
| `semanticSuccess` | `#059669` | `#34D399` | Online presence, verification, success toasts |

### B. Typography Scale (SF Pro / Inter Hierarchy + Dynamic Type)
- Enable `allowFontScaling` with `maxFontSizeMultiplier={1.35}` on chrome and `1.6` on body copy so Dynamic Type works without breaking layouts.
- Apply `fontVariant: ["tabular-nums"]` on all counters (likes, comments, followers), timestamps, audio durations, and call timers so numbers never jitter as they increment.
- **Scale:**
  - `LargeTitle`: `30pt / 700 / -0.5 tracking` (Profile display name, Messages / Explore header)
  - `Headline`: `17pt / 600 / -0.2 tracking` (Navigation bar titles, Sheet headers)
  - `Body`: `15.5pt / 400 / 22pt line-height` (Post copy, chat bubbles)
  - `Subhead`: `13.5pt / 500` (Author handles, reply previews)
  - `Caption`: `12pt / 500` (Relative timestamps, pill metadata)

### C. Spatial Rhythm & Squircle Geometry
- **Base grid:** `4pt` micro-unit, `16pt` horizontal page gutter, `12pt` card internal padding, `8pt` icon-to-label gap.
- **Continuous corners (`borderCurve: "continuous"` on iOS):**
  - `radiusSm: 10` (inputs, reply quote bars, chips)
  - `radiusMd: 16` (post media frames, analytics cards, message bubbles)
  - `radiusLg: 24` (bottom sheets, modals, composer cards)
  - `radiusPill: 999` (only for compact status badges, segmented controls, avatars)
- **Touch targets:** Enforce minimum `44 × 44pt` hit areas (`hitSlop` or min dimensions) on every icon button (`dots`, `heart`, `bookmark`, `back`, `reply`).

---

## 5. Motion, Gesture & Haptic Grammar

Define a single `lib/motion.ts` module used across the app (respecting `AccessibilityInfo.isReduceMotionEnabled`):

| Interaction | Animation Curve | Haptic Feedback (`expo-haptics`) |
| --- | --- | --- |
| **Tab switch / Segment toggle** | Spring slide (`damping: 22, stiffness: 260`) | `selectionAsync()` |
| **Like / Double-tap heart** | Scale `0.7 → 1.24 → 1.0` (`damping: 12, stiffness: 320`) + floating heart fade | `impactAsync(Light)` |
| **Story open / Photo lightbox** | Shared-bounds scale + opacity crossfade (`240ms` ease-out) | `impactAsync(Light)` |
| **Story dismiss / Sheet drag** | Velocity-driven pan gesture (`vy > 600` or `dy > 120` dismisses) | None until snap |
| **Swipe-to-reply in Chat** | Horizontal spring clamp at `64px` threshold with reply icon reveal | `impactAsync(Medium)` at lock threshold |
| **Post published / Report sent** | Subtle top glass Toast sliding down (`translateY: -60 → 0`) | `notificationAsync(Success)` |
| **Validation / Network error** | Subtle 3-cycle horizontal shake (`±6px`, `220ms`) + inline banner | `notificationAsync(Error)` |

---

## 6. Screen-by-Screen Apple-Grade Redesign Blueprints

### 6.1 Home Feed & Stories (`app/(tabs)/index.tsx`)
- **Collapsing Translucent Header:** Frosted glass (`BlurView`) header with Vibe wordmark, segmented **`Following | For You`** pill switcher, `+ Create` button, and Notification bell with live unread dot. Scrolls smoothly away on downward scroll and reappears on slight upward scroll.
- **Stories Rail:** Clean `68pt` avatars with 2px gradient unseen ring, subtle `"Your Story"` `+` badge, and gray hairline ring for already-viewed stories (wired to `story_views`). Horizontal snap with subtle parallax.
- **Feed Cards (Editorial Spacing):**
  - Remove heavy card borders; use full-width hairline separators or spacious `16pt` vertical rhythm with subtle elevated media frames (`borderRadius: 16`, `borderCurve: "continuous"`).
  - Aspect-ratio preservation using `media_width`/`media_height` (clamped between `4:5` portrait and `16:9` landscape) so images never jump layout (`CLS = 0`).
  - Optimistic interactions (`Like`, `Bookmark`, `Share`) with instant visual response and rollback toast on failure.
  - Inline `"Suggested for you"` / `"Trending"` modules styled minimally with dismiss (`×`) controls.

### 6.2 Reels (`app/(tabs)/reels.tsx`)
- **Edge-to-Edge Cinema Mode:** True full-bleed `100%` viewport playback with subtle top/bottom dark gradient scrims (`rgba(0,0,0,0.45) → transparent`) so white typography remains crisp over bright video frames.
- **Minimal Right Action Rail:** Translucent circular glass buttons (`44pt`) for Like, Comment, Share, Bookmark, and Audio Mute/Unmute.
- **Tap Interactions:** Single tap toggles pause with centered subtle play glyph; double-tap spawns heart burst at tap coordinates; long-press scrubs/pauses cleanly (zero accidental triggers); hashtag taps route cleanly to `/search?q=%23tag` with prefilled query!
- **Scrubber:** Slim `2pt` progress bar pinned directly above the tab bar that expands to `6pt` when scrubbed.

### 6.3 Search & Explore (`app/(tabs)/search.tsx`)
- **Native-Feel Search Bar:** Rounded `12pt` frosted pill with magnifying glass, clear (`×`) button, instant cancel transition, and deep-link `q` param hydration (`useLocalSearchParams`).
- **Curated Explore Grid (Empty Search State):** Apple App Store / Photos-inspired asymmetric mosaic (1 large featured `2×2` tile beside `1×1` tiles) for visual posts/reels, paired with horizontal trending topic chips.
- **Unified Search Results:** Segmented tabs (`Top`, `People`, `Posts`, `Tags`) with skeleton loading cards and contextual AI semantic chips (`components/ai/AISearchSuggestions.tsx` integrated inside the top strip, not as a floating widget).

### 6.4 Messages & Chat Thread (`app/(tabs)/messages.tsx`, `app/chat/[chatId].tsx`)
- **Messages Inbox:**
  - Large title `"Messages"` header collapsing into centered compact bar, search bar tucked cleanly beneath, and `+ Compose` + `Live` buttons top-right.
  - Swipe actions on conversation rows: swipe left to Mute / Archive, swipe right to Mark Unread.
  - Online status dot + typing indicator (`"typing..."` in accent purple) directly in the row subtitle.
- **Chat Thread (`chat/[chatId].tsx`):**
  - Sticky frosted header showing peer avatar, live presence (`"Active now"` / `"Last seen"`), and grouped `Audio Call` + `Video Call` + `Info` actions.
  - **Bubble Craft:** Tail-shaped continuous corners (`18pt` outer, `4pt` grouped consecutive inner corners), subtle gradient on outgoing bubbles, elevated neutral on incoming, inline timestamp reveal on horizontal drag, and sticky date separators (`"Today"`, `"Yesterday"`).
  - **Inline AI & Translation Fix:** Fix `translatedMsgId` state bug so translated text persists below the bubble inside a clean `"Translated from ... · Hide"` capsule; move AI Smart Replies & Tone Adjuster into a subtle sparkle button inside the composer bar that expands a compact horizontal suggestion tray above the keyboard.
  - **Shared Media Gallery (`chat-media/[chatId].tsx`):** Fix the Links tab query so shared URLs actually populate rich link preview cards, and wire the download/share button on Files.

### 6.5 Create Composer & Stories (`app/(tabs)/create.tsx`, `app/create-story.tsx`)
- **Keyboard-First Canvas:** Immediate focus on text/media preview with a sleek bottom attachment dock (`Photo/Video`, `Reel`, `Poll/Location`, `Audience Pill`, `AI Sparkle`).
- **Audience & Alt-Text Chips:** Inline `"Public ▾"` pill opening an instant sheet (`Public`, `Followers`, `Only Me`) and one-tap `"Add Alt Text"` badge on attached images (wired to `generateAIAltText`).
- **Unified Upload Reliability:** Normalize `.jpg` → `image/jpeg`, `.mov` → `video/quicktime`, and support `data:`/`blob:` URIs on Web so uploads succeed identically across all platforms.

### 6.6 Profile, Settings & Admin (`app/(tabs)/profile.tsx`, `app/user/[userId].tsx`, `app/settings.tsx`, `app/admin.tsx`)
- **Profile Header:** Crisp edge-to-edge blurred/gradient cover banner, overlapping `88pt` squircle-or-circle avatar with subtle `3pt` canvas ring, clear Bio + Website + Location/Pronouns metadata, and balanced 3-column tabular stats (`Posts · Followers · Following`).
- **Sticky Tab Bar (`Posts | Reels | Saved`):** Smooth sliding underline indicator with 3-column crisp square photo grid (`1.5pt` gap) + video duration/reel badges.
- **Settings (`settings.tsx`):** Authentic iOS grouped inset list style (`borderRadius: 14`, grouped section headers in uppercase `12pt` secondary text), real persisted toggles stored in AsyncStorage / `profiles` metadata, working `"Forgot password?"` reset flow in `login.tsx`, and clean diagnostics access.

### 6.7 Live Sessions & Calls (`app/live-sessions.tsx`, `app/call/[chatId].tsx`, `app/incoming-call.tsx`)
- **Honest Capability Framing & Visual Polish:** Until WebRTC media transport is integrated, clearly present Live Audio/Stage Rooms or Call Lobby states cleanly rather than broken blank camera views; use dynamic blurred avatar backdrops, floating live chat with soft gradient top fade, animated pulse rings on active speakers, and floating heart reactions.

---

## 7. Accessibility, Performance & Cross-Platform Checklist

- **Accessibility (`VoiceOver` / `TalkBack` / Keyboard):**
  - Label every icon-only `Pressable` (`accessibilityRole="button"`, `accessibilityLabel="Like post"`, `accessibilityState={{ selected: isLiked }}`).
  - Group feed post headers (`author + timestamp`) so screen readers announce `"Alex Morgan, 2 hours ago"` in one swipe rather than 4 fragmented stops.
  - Respect `AccessibilityInfo.isReduceMotionEnabled()` and WCAG AA (`>= 4.5:1` text contrast over all blurred/gradient surfaces).
- **Performance:**
  - Replace `FlatList` on heavy image feeds (`index.tsx`, `search.tsx`) with `@shopify/flash-list` or `windowSize={5}` + `removeClippedSubviews` + `expo-image` (`cachePolicy="memory-disk"` + BlurHash placeholders).
  - Memoize feed post cards (`React.memo` with stable callbacks) and pause offscreen videos cleanly via `useFocusEffect` + viewability config.
- **Web & Desktop Responsiveness:**
  - Center the feed and chat streams inside a `640px` max-width reading column on desktop viewports (`>= 768px`), converting the bottom tab bar into a left translucent sidebar rail (`240px` wide) on wide screens!

---

## 8. Phased Implementation Roadmap

1. **Phase 1 — Foundation & Cleanup (3–4 days):**
   - Consolidate design tokens (`constants/colors.ts`, `lib/motion.ts`), unify `Avatar` / `ActionSheet` / `Toast` primitives, remove duplicate `SettingsSheet` & `AIFloatingButton` clutter, and switch tabs from 6 → 5.
2. **Phase 2 — Core Surfaces & Bug Fixes (4–5 days):**
   - Redesign Home Feed + Stories rail, fix `/search?q=` hydration and `fetchRankedFeed` guest error, fix Chat translation state & `chat-media` Links tab, and normalize Web/iOS/Android media MIME + URI uploads.
3. **Phase 3 — Creation, Profile & Settings Polish (3–4 days):**
   - Build keyboard-first Create sheet, sticky Profile grid tabs, iOS-grouped Settings with persisted preferences, and cross-platform Group management (replacing `Alert.prompt`).
4. **Phase 4 — Motion, Accessibility & Desktop/Web Layout (2–3 days):**
   - Apply shared spring presets, semantic haptics, VoiceOver audit across all interactive controls, `640px` desktop rail layout, and automated UI snapshot/visual tests via Playwright.
