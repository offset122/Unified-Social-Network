import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

/**
 * Boot logging — survives launch crashes.
 *
 * Imported FIRST (via entry.js) so it wraps console + the global error handler
 * before any app code runs. Everything logged is kept in a ring buffer; a fatal
 * error is persisted to AsyncStorage so the /diagnostics screen can show the
 * cause on the next launch (the moment the app dies you normally see nothing).
 */

export type BootLogLevel = "boot" | "info" | "warn" | "error";
export type BootLogEntry = { t: number; level: BootLogLevel; msg: string };

const MAX_ENTRIES = 300;
const CRASH_KEY = "bootlog_last_crash_v1";
const START = Date.now();

const entries: BootLogEntry[] = [];
let installed = false;

function fmt(a: unknown): string {
  if (a instanceof Error) return a.stack ?? `${a.name}: ${a.message}`;
  if (typeof a === "object" && a !== null) {
    try { return JSON.stringify(a); } catch { return String(a); }
  }
  return String(a);
}

function ts(t: number): string {
  const dt = t - START;
  return dt < 1000 ? `${dt}ms` : `${(dt / 1000).toFixed(2)}s`;
}

function push(level: BootLogLevel, msg: string) {
  entries.push({ t: Date.now(), level, msg: msg.slice(0, 2000) });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
}

export const bootLog = {
  boot: (msg: string) => push("boot", msg),
  info: (msg: string) => push("info", msg),
  warn: (msg: string) => push("warn", msg),
  error: (msg: string) => push("error", msg),
};

export function formatBootLog(): string {
  return entries
    .map((e) => `${ts(e.t).padStart(8)} [${e.level.toUpperCase().padEnd(5)}] ${e.msg}`)
    .join("\n");
}

export function getBootEntries(): BootLogEntry[] {
  return [...entries];
}

export function clearBootLog() {
  entries.length = 0;
}

export type CrashRecord = {
  time: string;
  fatal: boolean;
  message: string;
  stack?: string;
  recent?: string[];
};

export async function getLastCrash(): Promise<CrashRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_KEY);
    return raw ? (JSON.parse(raw) as CrashRecord) : null;
  } catch {
    return null;
  }
}

export async function clearLastCrash() {
  try { await AsyncStorage.removeItem(CRASH_KEY); } catch {}
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const Clipboard = await import("expo-clipboard");
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

export function installBootLogging() {
  if (installed) return;
  installed = true;

  bootLog.boot(`boot start · ${Platform.OS} ${Platform.Version}`);

  // 1) Capture all existing console.* output
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  console.log = (...args: unknown[]) => { push("info", args.map(fmt).join(" ")); origLog(...args); };
  console.warn = (...args: unknown[]) => { push("warn", args.map(fmt).join(" ")); origWarn(...args); };
  console.error = (...args: unknown[]) => { push("error", args.map(fmt).join(" ")); origError(...args); };

  // 2) Global error handler: persist the crash, then chain to the previous
  //    handler so dev redbox / prod crash behavior stays unchanged.
  const ErrorUtilsAny = (global as any).ErrorUtils;
  if (ErrorUtilsAny?.setGlobalHandler) {
    const prevHandler = ErrorUtilsAny.getGlobalHandler?.();
    ErrorUtilsAny.setGlobalHandler((error: any, isFatal: boolean) => {
      const message = error?.message ?? String(error);
      push("error", `${isFatal ? "FATAL" : "ERROR"}: ${message}`);

      const record: CrashRecord = {
        time: new Date().toISOString(),
        fatal: !!isFatal,
        message,
        stack: error?.stack ?? "(no stack)",
        recent: entries.slice(-50).map((e) => `${ts(e.t)} [${e.level}] ${e.msg}`),
      };

      // Fire-and-forget: the native bridge usually flushes before the process dies.
      AsyncStorage.setItem(CRASH_KEY, JSON.stringify(record)).catch(() => {});
      origError(`[bootLog] ${isFatal ? "Fatal" : "Unhandled"} error captured:`, message);

      prevHandler?.(error, isFatal);
    });
  }
}

// Auto-install on import — this module must be the first thing the app loads.
installBootLogging();
