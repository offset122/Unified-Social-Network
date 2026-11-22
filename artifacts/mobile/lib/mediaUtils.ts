export type MediaKind = "image" | "video" | "audio" | "file";

const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/jpeg",
  heif: "image/jpeg",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  qt: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  mpeg: "audio/mpeg",
  ogg: "audio/ogg",
  aac: "audio/aac",
  m4a: "audio/x-m4a",
  pdf: "application/pdf",
};

const MIME_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/heic": "image/jpeg",
  "image/heif": "image/jpeg",
  "video/mov": "video/quicktime",
  "audio/mp4": "audio/x-m4a",
  "audio/m4a": "audio/x-m4a",
  "audio/mp3": "audio/mpeg",
};

export function normalizeMimeType(
  rawMimeOrExt: string | null | undefined,
  kind: MediaKind = "image",
): string {
  const cleaned = (rawMimeOrExt ?? "").trim().toLowerCase().split(";")[0];
  if (!cleaned) {
    if (kind === "video") return "video/mp4";
    if (kind === "audio") return "audio/x-m4a";
    if (kind === "file") return "application/pdf";
    return "image/jpeg";
  }

  if (MIME_ALIASES[cleaned]) return MIME_ALIASES[cleaned];
  if (cleaned.includes("/")) {
    return cleaned === "video/webm" && kind === "audio" ? "audio/webm" : cleaned;
  }

  const ext = cleaned.replace(/^\./, "");
  if (ext === "webm" && kind === "audio") return "audio/webm";
  if (EXTENSION_TO_MIME[ext]) return EXTENSION_TO_MIME[ext];

  if (kind === "video") return "video/mp4";
  if (kind === "audio") return "audio/x-m4a";
  if (kind === "file") return "application/pdf";
  return "image/jpeg";
}

export function inferExtension(uri: string, mimeType?: string | null): string {
  if (uri.startsWith("data:")) {
    const match = /^data:([^;,]+)/i.exec(uri);
    const mime = normalizeMimeType(match?.[1] ?? mimeType);
    return extensionFromMime(mime);
  }

  const withoutQuery = uri.split("?")[0].split("#")[0];
  const lastSegment = withoutQuery.split("/").pop() ?? "";
  const dotIdx = lastSegment.lastIndexOf(".");
  if (dotIdx > 0 && dotIdx < lastSegment.length - 1) {
    const ext = lastSegment.slice(dotIdx + 1).toLowerCase();
    if (ext === "jpg") return "jpeg";
    if (ext in EXTENSION_TO_MIME) return ext;
  }

  return extensionFromMime(normalizeMimeType(mimeType));
}

function extensionFromMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "video/quicktime":
      return "mov";
    case "video/webm":
    case "audio/webm":
      return "webm";
    case "video/mp4":
      return "mp4";
    case "audio/mpeg":
      return "mp3";
    case "audio/ogg":
      return "ogg";
    case "audio/aac":
      return "aac";
    case "audio/x-m4a":
      return "m4a";
    case "application/pdf":
      return "pdf";
    default:
      return "jpeg";
  }
}

export function isUploadableUri(uri: string): boolean {
  return (
    uri.startsWith("file://") ||
    uri.startsWith("content://") ||
    uri.startsWith("http://") ||
    uri.startsWith("https://") ||
    uri.startsWith("data:") ||
    uri.startsWith("blob:")
  );
}

/**
 * Clamps media aspect ratio between 4:5 portrait (0.8) and 16:9 landscape (1.777)
 * so feed cards maintain predictable vertical rhythm and zero layout jump.
 */
export function clampMediaAspectRatio(
  width?: number | null,
  height?: number | null,
  fallback = 4 / 3,
): number {
  if (!width || !height || width <= 0 || height <= 0) return fallback;
  const ratio = width / height;
  return Math.min(16 / 9, Math.max(4 / 5, ratio));
}
