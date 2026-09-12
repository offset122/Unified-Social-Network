// Supabase Edge Function: ai-proxy
// Keeps the OpenRouter key server-side. Deploy with:
//   supabase functions deploy ai-proxy
//   supabase secrets set OPENROUTER_KEY=sk-or-...
//
// Request:  { system: string, message: string, maxTokens?: number }
// Response: { content: string } | { error: string }
//
// Auth: requires a valid Supabase JWT (verified against your project's JWT secret).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemma-4-26b-a4b-it:free";
const MAX_TOKENS_CAP = 400;
const RATE_LIMIT = 30; // requests per minute per user

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }

  // Auth check — reject anonymous callers.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData } = await supabase.auth.getUser(token);
  if (!userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  // Optional: block banned users.
  const { data: profile } = await supabase
    .from("profiles").select("is_banned").eq("id", userId).maybeSingle();
  if (profile?.is_banned) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }

  // Per-user rate limit.
  const allowed = await checkRateLimit(userId);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429, headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("OPENROUTER_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "AI not configured" }), {
      status: 503, headers: { "Content-Type": "application/json" },
    });
  }

  let body: { system?: string; message?: string; maxTokens?: number };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Bad request" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const system = String(body.system ?? "").slice(0, 2000);
  const message = String(body.message ?? "").slice(0, 4000);
  const maxTokens = Math.min(Number(body.maxTokens ?? 150) || 150, MAX_TOKENS_CAP);
  if (!message) {
    return new Response(JSON.stringify({ error: "Empty message" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const resp = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: message },
        ],
        max_tokens: maxTokens,
      }),
    });
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: "Upstream error" }), {
        status: 502, headers: { "Content-Type": "application/json" },
      });
    }
    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content?.trim() ?? "";
    return new Response(JSON.stringify({ content }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Upstream error" }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }
});

// Simple in-memory sliding-window rate limiter.
// (Per-isolate; good enough to stop abuse spikes. For strict limits use
//  a cron-trimmed table in Postgres.)
const hits = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const arr = (hits.get(userId) ?? []).filter((t) => t > windowStart);
  if (arr.length >= RATE_LIMIT) {
    hits.set(userId, arr);
    return false;
  }
  arr.push(now);
  hits.set(userId, arr);
  return true;
}
