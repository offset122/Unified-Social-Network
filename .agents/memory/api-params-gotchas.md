---
name: API params gotchas
description: Known limitations in generated query param types.
---

- `GetUserPostsParams` only has `cursor?: string`. Passing `limit` causes `TS2353: Object literal may only specify known properties`. Use `undefined` or omit the params arg if you don't need cursor pagination.
- `GetFeedParams` does have `limit?: number` and `cursor?: string`.

**Why:** The OpenAPI spec for `/users/:userId/posts` only declares cursor-based pagination, not a limit param.

**How to apply:** When calling `useGetUserPosts(userId, params, options)`, pass `undefined` for params unless you have a cursor to pass.
