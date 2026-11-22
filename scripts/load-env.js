import fs from "node:fs";
import path from "node:path";

const ALLOWED_PUBLIC_KEYS = new Set([
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
]);

export function parseEnvFile(content) {
  const result = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) {
      result[key] = value;
    }
  }
  return result;
}

export function loadPublicEnv(mobileDir, baseEnv = process.env) {
  const nextEnv = { ...baseEnv };
  // Never propagate private keys into client EXPO_PUBLIC_ env vars
  delete nextEnv.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE;
  delete nextEnv.EXPO_PUBLIC_OPENROUTER_KEY;

  const candidates = [
    path.join(path.resolve(mobileDir, "..", ".."), ".env"),
    path.join(mobileDir, ".env"),
    path.join(mobileDir, ".env.local"),
  ];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const parsed = parseEnvFile(fs.readFileSync(filePath, "utf-8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (ALLOWED_PUBLIC_KEYS.has(key) && value) {
        nextEnv[key] = value;
      }
    }
  }

  return nextEnv;
}
