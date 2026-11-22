import test from "node:test";
import assert from "node:assert/strict";
import {
  isFontsReady,
  resolveSupabaseConfig,
  withTimeout,
} from "./bootReadiness";

test("isFontsReady unblocks on loaded, error, or timeout", () => {
  assert.equal(
    isFontsReady({ fontsLoaded: false, fontError: null, fontTimedOut: false }),
    false,
  );
  assert.equal(
    isFontsReady({ fontsLoaded: true, fontError: null, fontTimedOut: false }),
    true,
  );
  assert.equal(
    isFontsReady({
      fontsLoaded: false,
      fontError: new Error("font failed"),
      fontTimedOut: false,
    }),
    true,
  );
  assert.equal(
    isFontsReady({ fontsLoaded: false, fontError: null, fontTimedOut: true }),
    true,
  );
});

test("resolveSupabaseConfig validates real vs placeholder or empty env vars", () => {
  const valid = resolveSupabaseConfig(
    "https://qncxjobvjkaqzqajlkek.supabase.co",
    "eyJ-anon-key",
  );
  assert.equal(valid.isConfigured, true);
  assert.equal(valid.isPlaceholderUrl, false);
  assert.equal(valid.url, "https://qncxjobvjkaqzqajlkek.supabase.co");
  assert.equal(valid.anonKey, "eyJ-anon-key");

  const empty = resolveSupabaseConfig("", "");
  assert.equal(empty.isConfigured, false);
  assert.equal(empty.isPlaceholderUrl, true);
  assert.equal(empty.url, "https://placeholder.supabase.co");

  const placeholder = resolveSupabaseConfig(
    "https://your-project.supabase.co",
    "abc",
  );
  assert.equal(placeholder.isConfigured, false);
  assert.equal(placeholder.isPlaceholderUrl, true);
});

test("withTimeout resolves early with value and falls back on hang", async () => {
  const fast = await withTimeout(Promise.resolve("ok"), 100, "fallback");
  assert.deepEqual(fast, { value: "ok", timedOut: false });

  const slow = await withTimeout(
    new Promise<string>(() => {}),
    25,
    "fallback",
  );
  assert.deepEqual(slow, { value: "fallback", timedOut: true });
});
