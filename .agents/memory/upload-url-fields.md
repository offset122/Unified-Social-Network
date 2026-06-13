---
name: Upload URL fields
description: Correct field names for UploadUrlRequest — common source of TS2353 errors
---

The `UploadUrlRequest` schema has `name`, `size`, and `contentType` — NOT `fileName`.

**Why:** Generated from OpenAPI; the field was named `name` in the spec, not `fileName`.

**How to apply:** When calling `requestUploadUrl.mutateAsync({ data: { ... } })`, always use:
```ts
{ name: fileName, size: asset.fileSize ?? 500_000, contentType }
```
