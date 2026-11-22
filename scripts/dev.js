import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const mobileDir = path.join(rootDir, "artifacts", "mobile");
const bunStoreDir = path.join(rootDir, "node_modules", ".bun");
const port = String(process.env.APP_PORT || process.env.DEFAULT_APP_PORT || "3000");

function buildNodePath() {
  const paths = [];
  if (fs.existsSync(bunStoreDir)) {
    const hoisted = path.join(bunStoreDir, "node_modules");
    if (fs.existsSync(hoisted)) paths.push(hoisted);
    for (const entry of fs.readdirSync(bunStoreDir)) {
      if (entry === "node_modules") continue;
      const candidate = path.join(bunStoreDir, entry, "node_modules");
      if (fs.existsSync(candidate)) paths.push(candidate);
    }
  }
  if (process.env.NODE_PATH) paths.push(process.env.NODE_PATH);
  return paths.join(path.delimiter);
}

const env = {
  ...process.env,
  PORT: port,
  CI: "1",
  BROWSER: "none",
  EXPO_NO_TELEMETRY: "1",
  NODE_PATH: buildNodePath(),
};

const child = spawn(
  process.execPath,
  [
    "-r",
    "./polyfills.js",
    "./node_modules/expo/bin/cli",
    "start",
    "--web",
    "--localhost",
    "--port",
    port,
  ],
  {
    cwd: mobileDir,
    env,
    stdio: "inherit",
  },
);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    if (!child.killed) child.kill(sig);
  });
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
