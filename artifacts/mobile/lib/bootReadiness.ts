export interface FontReadinessInput {
  fontsLoaded: boolean;
  fontError: Error | null;
  fontTimedOut: boolean;
}

export function isFontsReady({
  fontsLoaded,
  fontError,
  fontTimedOut,
}: FontReadinessInput): boolean {
  return Boolean(fontsLoaded || fontError || fontTimedOut);
}

export interface SupabaseConfigResult {
  url: string;
  anonKey: string;
  isConfigured: boolean;
  isPlaceholderUrl: boolean;
}

export function resolveSupabaseConfig(
  rawUrl: string | undefined,
  rawAnonKey: string | undefined,
): SupabaseConfigResult {
  const url = (rawUrl ?? "").trim();
  const anonKey = (rawAnonKey ?? "").trim();

  const isPlaceholderUrl =
    !url ||
    url.includes("your-project.supabase.co") ||
    url.includes("placeholder.supabase.co") ||
    (!url.startsWith("https://") && !url.startsWith("http://"));

  const isConfigured = Boolean(!isPlaceholderUrl && anonKey);

  return {
    url: isPlaceholderUrl ? "https://placeholder.supabase.co" : url,
    anonKey: anonKey || "public-anon-key-placeholder",
    isConfigured,
    isPlaceholderUrl,
  };
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallbackValue: T,
): Promise<{ value: T; timedOut: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutPromise = new Promise<{ value: T; timedOut: true }>((resolve) => {
      timer = setTimeout(() => {
        resolve({ value: fallbackValue, timedOut: true });
      }, timeoutMs);
    });

    const wrappedPromise = promise.then((value) => ({
      value,
      timedOut: false as const,
    }));

    return await Promise.race([wrappedPromise, timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
