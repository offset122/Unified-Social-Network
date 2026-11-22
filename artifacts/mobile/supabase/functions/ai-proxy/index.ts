// Supabase Edge Function: ai-proxy
// Keeps the OpenRouter key server-side. Deploy with:
//   supabase functions deploy ai-proxy
//   supabase secrets set OPENROUTER_KEY=sk-or-...
//   supabase secrets set ALLOWED_ORIGINS=https://your-app-domain.example
//
// Request:  { system?: string, message?: string, messages?: { role: "system"|"user"|"assistant", content: string }[], maxTokens?: number }
// Response: { content: string } | { error: string }
//
// Auth: requires a valid Supabase JWT (verified against your project's JWT secret).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemma-4-26b-a4b-it:free";
const MAX_TOKENS_CAP = 400;
const RATE_LIMIT = 30; // requests per minute per user
const MAX_TRACKED_USERS = 5000;

function resolveCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  if (!origin) return {};
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const isLocalDev = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/i.test(origin);
  if (isLocalDev || configured.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    };
  }
  return {};
}

function jsonResponse(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

Deno.serve(async (req) => {
  const cors = resolveCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, cors);
  }

  // Auth check — reject anonymous callers.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return jsonResponse({ error: "Unauthorized" }, 401, cors);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: userData } = await supabase.auth.getUser(token);
  if (!userData?.user) {
    return jsonResponse({ error: "Unauthorized" }, 401, cors);
  }
  const userId = userData.user.id;

  // Block banned users.
  const { data: profile } = await supabase
    .from("profiles").select("is_banned").eq("id", userId).maybeSingle();
  if (profile?.is_banned) {
    return jsonResponse({ error: "Forbidden" }, 403, cors);
  }

  // Per-user rate limit.
  const allowed = checkRateLimit(userId);
  if (!allowed) {
    return jsonResponse({ error: "Rate limit exceeded" }, 429, cors);
  }

  const apiKey = Deno.env.get("OPENROUTER_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "AI not configured" }, 503, cors);
  }

  let body: {
    system?: string;
    message?: string;
    messages?: Array<{ role?: string; content?: string }>;
    maxTokens?: number;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Bad request" }, 400, cors);
  }

  const maxTokens = Math.min(Math.max(Number(body.maxTokens ?? 150) || 150, 1), MAX_TOKENS_CAP);
  let outboundMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>;

  if (Array.isArray(body.messages) && body.messages.length > 0) {
    const clean = body.messages
      .slice(-20)
      .filter((m) => m && (m.role === "system" || m.role === "user" || m.role === "assistant"))
      .map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: String(m.content ?? "").slice(0, 4000).trim(),
      }))
      .filter((m) => m.content.length > 0);
    if (clean.length === 0) {
      return jsonResponse({ error: "Empty messages" }, 400, cors);
    }
    const systemText = String(body.system ?? "").slice(0, 2000).trim();
    outboundMessages = systemText
      ? [{ role: "system", content: systemText }, ...clean.filter((m) => m.role !== "system")]
      : clean;
  } else {
    const system = String(body.system ?? "").slice(0, 2000);
    const message = String(body.message ?? "").slice(0, 4000).trim();
    if (!message) {
      return jsonResponse({ error: "Empty message" }, 400, cors);
    }
    outboundMessages = [
      { role: "system", content: system },
      { role: "user", content: message },
    ];
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
        messages: outboundMessages,
        max_tokens: maxTokens,
      }),
    });
    if (!resp.ok) {
      return jsonResponse({ error: "Upstream error" }, 502, cors);
    }
    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content?.trim() ?? "";
    return jsonResponse({ content }, 200, cors);
  } catch {
    return jsonResponse({ error: "Upstream error" }, 502, cors);
  }
});

// Simple in-memory sliding-window rate limiter with stale-entry pruning.
const hits = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;

  if (hits.size > MAX_TRACKED_USERS) {
    for (const [key, timestamps] of hits.entries()) {
      const fresh = timestamps.filter((t) => t > windowStart);
      if (fresh.length === 0) hits.delete(key);
      else hits.set(key, fresh);
    }
  }

  const arr = (hits.get(userId) ?? []).filter((t) => t > windowStart);
  if (arr.length >= RATE_LIMIT) {
    hits.set(userId, arr);
    return false;
  }
  arr.push(now);
  hits.set(userId, arr);
  return true;
}
