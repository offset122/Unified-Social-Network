---
name: Shared Avatar component
description: Where the Avatar component lives; was previously inline-only
---

A shared `Avatar` component exists at `artifacts/mobile/components/Avatar.tsx`.
Import as: `import { Avatar } from "@/components/Avatar";`

Props: `{ name: string; avatarUrl?: string | null; size: number }`

**Why:** Was originally inlined inside `(tabs)/index.tsx`. Created as a shared component when call and story-viewer screens needed it.
