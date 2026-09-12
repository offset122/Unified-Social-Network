// Custom entry point: boot logging is installed BEFORE any app code runs,
// so launch-time crashes are captured and persisted for /diagnostics.
//
// package.json "main" points here. To revert: set it back to "expo-router/entry".
import "./lib/bootLog";
import "expo-router/entry";
