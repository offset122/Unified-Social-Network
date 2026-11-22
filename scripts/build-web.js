import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPublicEnv } from "./load-env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const mobileDir = path.join(rootDir, "artifacts", "mobile");
const bunStoreDir = path.join(rootDir, "node_modules", ".bun");

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

const result = spawnSync(
  process.execPath,
  [
    "-r",
    "./polyfills.js",
    "./node_modules/expo/bin/cli",
    "export",
    "-p",
    "web",
    "--clear",
  ],
  {
    cwd: mobileDir,
    env: {
      ...loadPublicEnv(mobileDir, process.env),
      CI: "1",
      EXPO_NO_TELEMETRY: "1",
      NODE_PATH: buildNodePath(),
    },
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
