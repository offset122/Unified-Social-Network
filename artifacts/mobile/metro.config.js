const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("fs");

const projectRoot = __dirname;
const defaultConfig = getDefaultConfig(projectRoot);

const extraWatchFolders = [path.resolve(projectRoot, "../../node_modules")].filter((p) => fs.existsSync(p));

defaultConfig.watchFolders = [
  ...(defaultConfig.watchFolders || []),
  ...extraWatchFolders,
];

defaultConfig.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(projectRoot, "../../node_modules"),
];

module.exports = defaultConfig;
