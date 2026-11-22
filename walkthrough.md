# Security Summary

| Metric | Count |
| --- | --- |
| **Files & Schemas Audited** | 68+ source, server, Edge Function, SQL, and config files |
| **Security Findings Addressed** | 12 (7 fixed in application/server/Edge Function code, 5 staged in hardening migration / requiring external key rotation) |
| **Dependency Vulnerabilities (`bun audit`)** | 0 across 326 packages |

### Issues Resolved

| Severity | Finding | Location | Resolution | Status |
| --- | --- | --- | --- | --- |
| **Critical** | Reflected XSS & Host Header Injection in Expo landing page HTML and inline `<script>` (`EXPS_URL_PLACEHOLDER` / `BASE_URL_PLACEHOLDER`) | `artifacts/mobile/server/serve.js`, `artifacts/mobile/server/templates/landing-page.html` | Added strict protocol allowlist (`http`/`https`), RFC hostname/port regex validation (`sanitizeHost`), HTML entity escaping, and `JSON.stringify` literal encoding for `deepLink` | **Fixed** |
| **Critical** | Client-side exposure of `EXPO_PUBLIC_OPENROUTER_KEY` and `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE` placeholders & direct browser/app OpenRouter API calls (`callAI`, `chatWithAI`) | `.env.example`, `artifacts/mobile/lib/db.ts` | Removed private key variables from `EXPO_PUBLIC_*` in `.env.example`; removed direct OpenRouter client fallback in `callAI()` and routed `chatWithAI()` strictly through `ai-proxy` with JWT + `apikey` headers | **Fixed** (Rotate any previously exposed keys in Supabase/OpenRouter dashboards) |
| **High** | Missing CORS / `OPTIONS` preflight, single-turn-only payload, and unbounded rate-limiter `Map` growth in `ai-proxy` | `artifacts/mobile/supabase/functions/ai-proxy/index.ts` | Added origin-validated CORS (`ALLOWED_ORIGINS` + localhost dev), `OPTIONS` preflight, multi-turn `messages` validation, `is_banned` enforcement, and stale entry pruning | **Fixed** (Deploy Edge Function via `supabase functions deploy ai-proxy`) |
| **High** | Path traversal prefix bypass (`!filePath.startsWith(STATIC_ROOT)` without separator), unhandled malformed URI encoding, and uncaught `new URL` crash on invalid `Host` header | `artifacts/mobile/server/serve.js` | Enforced `path.sep` boundary check (`filePath !== rootResolved && !filePath.startsWith(rootResolved + path.sep)`), `decodeURIComponent` error handling, null-byte rejection, `try/catch` URL parsing, and security response headers | **Fixed** |
| **High** | Broken moderation queue (`admin.tsx` queried `notifications` table) and user reports notifying the reported user (`user/[userId].tsx`) | `artifacts/mobile/app/admin.tsx`, `artifacts/mobile/app/user/[userId].tsx`, `artifacts/mobile/lib/db.ts` | Wired `admin.tsx` to `fetchReports()`/`resolveReport()` with error handling; updated `user/[userId].tsx` `submitReport` to insert into `reports` via `createReport` | **Fixed** |
| **Critical** | Privilege escalation on `profiles` (`is_admin`, `is_banned`, counters writable by any user on own profile update) + missing admin RLS for banning/post deletion | `artifacts/mobile/supabase-schema.sql:423` | Added `protect_profile_privileged_columns()` `BEFORE UPDATE` trigger and admin RLS policies in new migration | **Needs Follow-Up** (Run `20260915_security_hardening.sql` in Supabase SQL Editor) |
| **Critical** | Open `conversation_members` `INSERT` (`with check (true)`) and `notifications` `INSERT` (`with check (true)`), plus broad `message_reactions` `SELECT` | `fix_messaging.sql`, `missing_tables.sql`, `supabase-schema.sql`, `message_reactions.sql` | Restricted `conversation_members` inserts to conversation creator/admins, restricted `notifications` inserts to `auth.uid() = actor_id` (excluding blocked pairs), and scoped `message_reactions` reads to members | **Needs Follow-Up** (Run `20260915_security_hardening.sql`) |
| **High** | Unauthenticated `SECURITY DEFINER` RPCs accepting arbitrary user IDs (`upsert_live_viewer`, `remove_live_viewer`, `accept_join_request`, `reject_join_request`, `get_dm_conversation`, `get_dm_other_user`, `fetch_ranked_feed`) without `auth.uid()` or `SET search_path` | `artifacts/mobile/supabase-schema.sql`, `live_streams_enhanced.sql`, `20260912_feed_ui_enhancements.sql` | Rewrote RPCs with `SET search_path = public` and strict `auth.uid()` / host / membership authorization checks | **Needs Follow-Up** (Run `20260915_security_hardening.sql`) |
| **Medium** | `posts` `SELECT` RLS ignoring `'followers'` visibility and `blocks` table, plus missing `story_views`, `live_likes`, and `avatars` bucket | `artifacts/mobile/supabase-schema.sql`, `artifacts/mobile/lib/db.ts` | Added `'followers'` + `blocks` enforcement to `posts_select` and created missing tables/bucket in hardening migration | **Needs Follow-Up** (Run `20260915_security_hardening.sql`) |

### Safeguards Verified

| Safeguard | Scope | Result |
| --- | --- | --- |
| **Host & Protocol Sanitization + Output Escaping** | `artifacts/mobile/server/serve.js`, `landing-page.html` | Verified via `serve.test.js` (5/5 tests pass) and headless Chromium inspection (`console` errors: 0) |
| **Static File Root Containment & Malformed Request Handling** | `artifacts/mobile/server/serve.js` | Verified sibling-prefix traversal (`/../static-build-secret/`), `%2e%2e`, `%00`, and malformed `%E0%A4%A` return non-200/400 without crashing |
| **TypeScript Compile Safety** | `artifacts/mobile` (`bootLog.ts` `globalThis` fix + edited files) | `npx --prefix artifacts/mobile tsc -p artifacts/mobile/tsconfig.json --noEmit` exits `0` |
| **Dependency Supply Chain** | Root + Workspace dependencies | `bun audit` completed with 0 known vulnerabilities across 326 packages |
| **Server-Side AI Proxy** | `artifacts/mobile/supabase/functions/ai-proxy/index.ts`, `artifacts/mobile/lib/db.ts` | Verified all AI helper calls (`callAI`, `chatWithAI`) send authenticated JWT + `apikey` solely to `ai-proxy`; zero client `OPENROUTER_KEY` references remain in `db.ts` |

---

## PoC Verification

### 1. Reflected XSS & Host Header Poisoning (`serve.js` + `landing-page.html`)
- **Attack Vector:** Sending `GET /` with `X-Forwarded-Host: attacker.com";alert(document.cookie);//` and `X-Forwarded-Proto: javascript`.
- **Previous Behavior:** `serveLandingPage` interpolated headers directly into `<a href="exps://EXPS_URL_PLACEHOLDER">` and `const deepLink = "exps://EXPS_URL_PLACEHOLDER";`, breaking out of the JavaScript string literal inside `<script>` and executing arbitrary script on load.
- **Patched Trace & Verification:**
  1. `sanitizeProtocol("javascript")` rejects non-`http`/`https` schemes and defaults to `"https"`.
  2. `sanitizeHost('attacker.com";alert(document.cookie);//')` fails `HOST_REGEX` validation and falls back to `"localhost:3000"`.
  3. `renderLandingPage` emits `JSON.stringify("exps://localhost:3000").replace(/</g, "\\u003c")` into `EXPS_DEEP_LINK_JSON_PLACEHOLDER` and HTML-escapes attributes (`EXPS_URL_PLACEHOLDER`, `BASE_URL_PLACEHOLDER`, `APP_NAME_PLACEHOLDER`).
  4. Verified automatically in `artifacts/mobile/server/serve.test.js` (`HTTP server handles malformed hosts, XSS headers, and static traversal safely`) and visually in headless Chromium at `http://localhost:3000` (clean DOM, valid QR deep link `exps://localhost:3000`, 0 console errors).

### 2. Sibling-Directory Prefix Traversal & Malformed URL DoS (`serve.js`)
- **Attack Vector:** Requesting `/../static-build-secret/secret.txt` (where sibling folder shares the `static-build` prefix) or `/%E0%A4%A` or sending HTTP/1.0 without a `Host` header.
- **Previous Behavior:** `!filePath.startsWith(STATIC_ROOT)` evaluated to `false` for `.../static-build-secret/...` because it lacked `+ path.sep`, allowing file read outside `STATIC_ROOT`; invalid `%` encodings or missing `Host` could throw uncaught exceptions inside `new URL(...)`.
- **Patched Trace & Verification:**
  1. `resolveSafeStaticPath` decodes inside `try/catch` (`400` on invalid encoding or `\0`), normalizes via `path.posix.normalize`, resolves against `STATIC_ROOT`, and enforces `filePath === rootResolved || filePath.startsWith(rootResolved + path.sep)`.
  2. `createAppServer` parses `req.url` against fixed `"http://localhost"` inside `try/catch` (`400 Bad Request` on invalid URLs).
  3. Verified in `serve.test.js` (`resolveSafeStaticPath blocks directory traversal and sibling-prefix bypass` & HTTP integration test): sibling secret returns non-200, `%E0%A4%A` returns `400`, valid `/index.js` returns `200` with `x-content-type-options: nosniff`.

### 3. Client Secret Removal & Authenticated AI Proxy (`db.ts` + `ai-proxy/index.ts`)
- **Attack Vector:** Reading client JS bundle for `EXPO_PUBLIC_OPENROUTER_KEY` / `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE` or calling OpenRouter directly from unauthenticated/banned clients (`chatWithAI`), plus browser CORS preflight failure on `expo web`.
- **Patched Trace & Verification:**
  1. `.env.example` no longer lists `EXPO_PUBLIC_OPENROUTER_KEY` or `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE`.
  2. `db.ts` `callAI()` and `chatWithAI()` require an active Supabase session JWT (`token`), attach `apikey` + `Authorization: Bearer <token>`, and call `${SUPABASE_URL}/functions/v1/ai-proxy` exclusively.
  3. `ai-proxy/index.ts` handles `OPTIONS` preflight with `ALLOWED_ORIGINS`/localhost origin matching (no wildcard `*` on authenticated endpoints), verifies JWT via `supabase.auth.getUser(token)`, rejects `profile.is_banned`, enforces per-user sliding-window rate limits with stale-map pruning, and validates bounded `messages` / `message` payloads.

### 4. Moderation Queue & Database Hardening (`admin.tsx`, `user/[userId].tsx`, `20260915_security_hardening.sql`)
- **Attack Vector:**
  - Any user calling `supabase.from("profiles").update({ is_admin: true })` to self-promote, or inserting themselves into any DM/group `conversation_members` row (`with check (true)`) to read private messages.
  - Reporting a user inserting a `'report'` notification targeted at the reported user (`user/[userId].tsx`), while `admin.tsx` queried `notifications` instead of `reports`.
- **Patched Trace & Verification:**
  - Client/Admin code updated so `user/[userId].tsx` calls `createReport(...)` against `reports` and `admin.tsx` reads/resolves via `fetchReports()`/`resolveReport()` with error alerts on failure.
  - `20260915_security_hardening.sql` stages the `protect_profile_privileged_columns()` trigger, strict `conversation_members`/`notifications`/`message_reactions`/`posts` RLS, `auth.uid()` checks inside `SECURITY DEFINER` RPCs, and missing `story_views`, `live_likes`, and `avatars` storage bucket.
