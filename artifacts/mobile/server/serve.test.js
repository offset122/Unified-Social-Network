const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

const {
  sanitizeProtocol,
  sanitizeHost,
  escapeHtml,
  renderLandingPage,
  resolveSafeStaticPath,
  createAppServer,
} = require("./serve");

function request(port, reqPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: reqPath,
        method: "GET",
        agent: false,
        headers: { connection: "close", ...headers },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf-8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

test("sanitizeProtocol allows only http and https", () => {
  assert.equal(sanitizeProtocol("http"), "http");
  assert.equal(sanitizeProtocol("HTTPS"), "https");
  assert.equal(sanitizeProtocol("https, http"), "https");
  assert.equal(sanitizeProtocol("javascript"), "https");
  assert.equal(sanitizeProtocol('http" onclick="alert(1)'), "https");
});

test("sanitizeHost rejects XSS, whitespace, quotes, and path characters", () => {
  assert.equal(sanitizeHost("vibe.example.com:3000"), "vibe.example.com:3000");
  assert.equal(sanitizeHost('evil.com";alert(1);//'), "localhost:3000");
  assert.equal(sanitizeHost("<script>alert(1)</script>"), "localhost:3000");
  assert.equal(sanitizeHost("evil.com/../../foo"), "localhost:3000");
  assert.equal(sanitizeHost("good.example.com, evil.com"), "good.example.com");
});

test("renderLandingPage escapes HTML and safely JSON-encodes script deepLink", () => {
  const templatePath = path.resolve(__dirname, "templates", "landing-page.html");
  const template = fs.readFileSync(templatePath, "utf-8");

  const rendered = renderLandingPage(
    template,
    'Vibe <script>alert("x")</script>',
    'javascript:alert(1)',
    'evil.com";alert(1);//',
  );

  assert.doesNotMatch(rendered, /evil\.com";alert\(1\)/);
  assert.doesNotMatch(rendered, /<script>alert\("x"\)<\/script>/);
  assert.match(rendered, /const deepLink = "exps:\/\/localhost:3000";/);
  assert.match(rendered, /href="exps:\/\/localhost:3000"/);
  assert.match(rendered, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
});

test("resolveSafeStaticPath blocks directory traversal and sibling-prefix bypass", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-serve-test-"));
  const staticRoot = path.join(tmpDir, "static-build");
  const siblingSecret = path.join(tmpDir, "static-build-secret");
  fs.mkdirSync(staticRoot, { recursive: true });
  fs.mkdirSync(siblingSecret, { recursive: true });
  fs.writeFileSync(path.join(staticRoot, "ok.txt"), "hello");
  fs.writeFileSync(path.join(siblingSecret, "secret.txt"), "top-secret");

  try {
    const valid = resolveSafeStaticPath("/ok.txt", staticRoot);
    assert.equal(valid.filePath, path.join(staticRoot, "ok.txt"));

    const sibling = resolveSafeStaticPath("/../static-build-secret/secret.txt", staticRoot);
    assert.ok(!sibling.filePath || !sibling.filePath.startsWith(siblingSecret));

    const encodedTraversal = resolveSafeStaticPath("/%2e%2e/static-build-secret/secret.txt", staticRoot);
    assert.ok(!encodedTraversal.filePath || !encodedTraversal.filePath.startsWith(siblingSecret));

    const badEncoding = resolveSafeStaticPath("/%E0%A4%A", staticRoot);
    assert.equal(badEncoding.errorStatus, 400);

    const nullByte = resolveSafeStaticPath("/ok.txt%00.js", staticRoot);
    assert.equal(nullByte.errorStatus, 400);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("HTTP server handles malformed hosts, XSS headers, and static traversal safely", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-http-test-"));
  const staticRoot = path.join(tmpDir, "static-build");
  const siblingSecret = path.join(tmpDir, "static-build-secret");
  fs.mkdirSync(staticRoot, { recursive: true });
  fs.mkdirSync(siblingSecret, { recursive: true });
  fs.writeFileSync(path.join(staticRoot, "index.js"), "console.log(1);");
  fs.writeFileSync(path.join(siblingSecret, "secret.txt"), "top-secret");

  const server = createAppServer({
    staticRoot,
    webRoot: path.join(tmpDir, "missing-dist"),
    appName: "Vibe",
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    // 1. XSS Host header attack on landing page
    const xssRes = await request(port, "/", {
      "x-forwarded-host": 'attacker.com";alert(document.cookie);//',
      "x-forwarded-proto": "javascript",
    });
    assert.equal(xssRes.status, 200);
    assert.equal(xssRes.headers["x-content-type-options"], "nosniff");
    assert.doesNotMatch(xssRes.body, /attacker\.com/);
    assert.match(xssRes.body, /const deepLink = "exps:\/\/localhost:3000";/);

    // 2. Sibling-prefix traversal attack cannot read static-build-secret
    const travRes = await request(port, "/../static-build-secret/secret.txt");
    assert.notEqual(travRes.status, 200);
    assert.doesNotMatch(travRes.body, /top-secret/);

    // 3. Valid static file serves cleanly
    const okRes = await request(port, "/index.js");
    assert.equal(okRes.status, 200);
    assert.equal(okRes.body, "console.log(1);");

    // 4. Malformed URI encoding returns 400 without crashing server
    const badRes = await request(port, "/%E0%A4%A");
    assert.equal(badRes.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("HTTP server serves exported web app from webRoot when dist/index.html exists", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-web-test-"));
  const webRoot = path.join(tmpDir, "dist");
  fs.mkdirSync(path.join(webRoot, "_expo"), { recursive: true });
  fs.writeFileSync(path.join(webRoot, "index.html"), "<html><body>web-app</body></html>");
  fs.writeFileSync(path.join(webRoot, "login.html"), "<html><body>login-page</body></html>");
  fs.writeFileSync(path.join(webRoot, "_expo", "app.js"), "console.log('web');");

  const server = createAppServer({ webRoot, appName: "Vibe" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const rootRes = await request(port, "/");
    assert.equal(rootRes.status, 200);
    assert.equal(rootRes.body, "<html><body>web-app</body></html>");

    const loginRes = await request(port, "/login");
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body, "<html><body>login-page</body></html>");

    const spaFallback = await request(port, "/some-client-route");
    assert.equal(spaFallback.status, 200);
    assert.equal(spaFallback.body, "<html><body>web-app</body></html>");

    const assetRes = await request(port, "/_expo/app.js");
    assert.equal(assetRes.status, 200);
    assert.equal(assetRes.body, "console.log('web');");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
