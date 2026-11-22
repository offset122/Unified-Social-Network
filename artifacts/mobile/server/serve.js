/**
 * Standalone production server for Expo static builds.
 *
 * Serves the output of build.js (static-build/) with two special routes:
 * - GET / or /manifest with expo-platform header → platform manifest JSON
 * - GET / without expo-platform → landing page HTML
 * Everything else falls through to static file serving from ./static-build/.
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const STATIC_ROOT = path.resolve(__dirname, "..", "static-build");
const WEB_ROOT = path.resolve(__dirname, "..", "dist");
const TEMPLATE_PATH = path.resolve(__dirname, "templates", "landing-page.html");
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
};

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

const HOST_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)(?::\d{1,5})?$/;

function sanitizeProtocol(rawProto) {
  const first = String(rawProto || "").split(",")[0].trim().toLowerCase();
  return first === "http" || first === "https" ? first : "https";
}

function sanitizeHost(rawHost, fallbackHost = process.env.PUBLIC_HOST || "localhost:3000") {
  const first = String(rawHost || "").split(",")[0].trim();
  if (first && HOST_REGEX.test(first) && !first.includes("..")) {
    return first;
  }
  const cleanFallback = String(fallbackHost || "localhost:3000").trim();
  return HOST_REGEX.test(cleanFallback) ? cleanFallback : "localhost:3000";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderLandingPage(landingPageTemplate, appName, rawProtocol, rawHost) {
  const protocol = sanitizeProtocol(rawProtocol);
  const host = sanitizeHost(rawHost);
  const baseUrl = `${protocol}://${host}`;
  const deepLink = `exps://${host}`;
  const deepLinkJson = JSON.stringify(deepLink).replace(/</g, "\\u003c");

  return landingPageTemplate
    .replace(/EXPS_DEEP_LINK_JSON_PLACEHOLDER/g, deepLinkJson)
    .replace(/BASE_URL_PLACEHOLDER/g, escapeHtml(baseUrl))
    .replace(/EXPS_URL_PLACEHOLDER/g, escapeHtml(host))
    .replace(/APP_NAME_PLACEHOLDER/g, escapeHtml(appName));
}

function resolveSafeStaticPath(urlPath, staticRoot = STATIC_ROOT) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(urlPath || "/"));
  } catch {
    return { errorStatus: 400 };
  }

  if (decoded.includes("\0")) {
    return { errorStatus: 400 };
  }

  const normalizedRel = path.posix.normalize("/" + decoded).replace(/^\/+/, "");
  const rootResolved = path.resolve(staticRoot);
  const filePath = path.resolve(rootResolved, normalizedRel);

  if (filePath !== rootResolved && !filePath.startsWith(rootResolved + path.sep)) {
    return { errorStatus: 403 };
  }

  return { filePath };
}

function getAppName() {
  try {
    const appJsonPath = path.resolve(__dirname, "..", "app.json");
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveManifest(platform, res) {
  const manifestPath = path.join(STATIC_ROOT, platform, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    res.writeHead(404, { ...SECURITY_HEADERS, "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: `Manifest not found for platform: ${platform}` }),
    );
    return;
  }

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "content-type": "application/json",
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
  });
  res.end(manifest);
}

function serveLandingPage(req, res, landingPageTemplate, appName) {
  const html = renderLandingPage(
    landingPageTemplate,
    appName,
    req.headers["x-forwarded-proto"],
    req.headers["x-forwarded-host"] || req.headers["host"],
  );

  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "content-type": "text/html; charset=utf-8",
  });
  res.end(html);
}

function sendFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { ...SECURITY_HEADERS, "content-type": contentType });
  res.end(content);
}

function serveStaticFile(urlPath, res, staticRoot = STATIC_ROOT) {
  const resolved = resolveSafeStaticPath(urlPath, staticRoot);
  if (resolved.errorStatus) {
    res.writeHead(resolved.errorStatus, SECURITY_HEADERS);
    res.end(resolved.errorStatus === 400 ? "Bad Request" : "Forbidden");
    return;
  }

  const { filePath } = resolved;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, SECURITY_HEADERS);
    res.end("Not Found");
    return;
  }

  sendFile(filePath, res);
}

function serveWebExport(urlPath, res, webRoot) {
  const resolved = resolveSafeStaticPath(urlPath === "/" ? "/index.html" : urlPath, webRoot);
  if (resolved.errorStatus) {
    res.writeHead(resolved.errorStatus, SECURITY_HEADERS);
    res.end(resolved.errorStatus === 400 ? "Bad Request" : "Forbidden");
    return;
  }

  const { filePath } = resolved;
  if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
    return sendFile(filePath, res);
  }

  if (!path.extname(urlPath)) {
    const htmlCandidate = resolveSafeStaticPath(`${urlPath.replace(/\/+$/, "")}.html`, webRoot);
    if (
      htmlCandidate.filePath &&
      fs.existsSync(htmlCandidate.filePath) &&
      !fs.statSync(htmlCandidate.filePath).isDirectory()
    ) {
      return sendFile(htmlCandidate.filePath, res);
    }
    return sendFile(path.join(webRoot, "index.html"), res);
  }

  res.writeHead(404, SECURITY_HEADERS);
  res.end("Not Found");
}

function createAppServer(options = {}) {
  const landingPageTemplate =
    options.landingPageTemplate ?? fs.readFileSync(TEMPLATE_PATH, "utf-8");
  const appName = options.appName ?? getAppName();
  const staticRoot = options.staticRoot ?? STATIC_ROOT;
  const webRoot = options.webRoot ?? WEB_ROOT;

  return http.createServer((req, res) => {
    let pathname;
    try {
      const url = new URL(req.url || "/", "http://localhost");
      pathname = url.pathname;
    } catch {
      res.writeHead(400, SECURITY_HEADERS);
      res.end("Bad Request");
      return;
    }

    if (basePath && pathname.startsWith(basePath)) {
      pathname = pathname.slice(basePath.length) || "/";
    }

    const platform = req.headers["expo-platform"];
    if ((pathname === "/" || pathname === "/manifest") && (platform === "ios" || platform === "android")) {
      return serveManifest(platform, res);
    }

    if (fs.existsSync(path.join(webRoot, "index.html"))) {
      return serveWebExport(pathname, res, webRoot);
    }

    if (pathname === "/") {
      return serveLandingPage(req, res, landingPageTemplate, appName);
    }

    serveStaticFile(pathname, res, staticRoot);
  });
}

if (require.main === module) {
  const server = createAppServer();
  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port, "0.0.0.0", () => {
    console.log(`Serving static Expo build on port ${port}`);
  });
}

module.exports = {
  sanitizeProtocol,
  sanitizeHost,
  escapeHtml,
  renderLandingPage,
  resolveSafeStaticPath,
  createAppServer,
};
