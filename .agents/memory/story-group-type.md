---
name: StoryGroup user field
description: StoryGroup type uses .user not .author for the story author.
---

The `StoryGroup` type generated from the OpenAPI spec has:
```ts
interface StoryGroup {
  user: UserSummary;
  stories: Story[];
  hasUnviewed: boolean;
}
```

**Why:** The API spec defines it as `user`, not `author`. Using `group.author` causes `TS2339: Property 'author' does not exist on type 'StoryGroup'`.

**How to apply:** When rendering story groups, always use `group.user.id`, `group.user.displayName`, etc. (not `group.author`).
