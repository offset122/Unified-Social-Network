import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMimeType,
  inferExtension,
  isUploadableUri,
  clampMediaAspectRatio,
} from "./mediaUtils";

test("normalizeMimeType maps .jpg, image/jpg, .mov, and heic cleanly", () => {
  assert.equal(normalizeMimeType("jpg", "image"), "image/jpeg");
  assert.equal(normalizeMimeType("image/jpg", "image"), "image/jpeg");
  assert.equal(normalizeMimeType(".heic", "image"), "image/jpeg");
  assert.equal(normalizeMimeType("mov", "video"), "video/quicktime");
  assert.equal(normalizeMimeType("video/mov", "video"), "video/quicktime");
  assert.equal(normalizeMimeType("webm", "audio"), "audio/webm");
  assert.equal(normalizeMimeType("webm", "video"), "video/webm");
  assert.equal(normalizeMimeType(undefined, "video"), "video/mp4");
});

test("inferExtension handles data URIs, file URIs with query params, and fallbacks", () => {
  assert.equal(inferExtension("data:image/png;base64,AAA="), "png");
  assert.equal(inferExtension("data:image/jpeg;base64,AAA="), "jpeg");
  assert.equal(inferExtension("file:///var/mobile/photo.jpg?size=full"), "jpeg");
  assert.equal(inferExtension("file:///var/mobile/clip.mov"), "mov");
  assert.equal(inferExtension("blob:http://localhost:3000/1234-5678", "video/quicktime"), "mov");
});

test("isUploadableUri supports mobile file/content and web blob/data/http URIs", () => {
  assert.equal(isUploadableUri("file:///tmp/a.jpg"), true);
  assert.equal(isUploadableUri("content://media/1"), true);
  assert.equal(isUploadableUri("blob:http://localhost:3000/abc"), true);
  assert.equal(isUploadableUri("data:image/jpeg;base64,/9j/"), true);
  assert.equal(isUploadableUri("https://cdn.example.com/a.png"), true);
  assert.equal(isUploadableUri("ftp://bad.example.com/a"), false);
});

test("clampMediaAspectRatio bounds portrait and landscape extremes", () => {
  assert.equal(clampMediaAspectRatio(1000, 3000), 0.8);
  assert.equal(clampMediaAspectRatio(3000, 1000), 16 / 9);
  assert.equal(clampMediaAspectRatio(1200, 1200), 1);
  assert.equal(clampMediaAspectRatio(null, null, 1), 1);
});
