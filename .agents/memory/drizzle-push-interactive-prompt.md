---
name: drizzle-kit push interactive prompt workaround
description: How to add a single column without getting stuck on unrelated drizzle-kit push confirmation prompts
---

`drizzle-kit push` diffs the *entire* schema against the DB, not just the change you made. If there is pre-existing drift elsewhere (e.g. a unique constraint that was never applied to an existing table with data), it will show an interactive arrow-key prompt ("truncate table?" etc.) before applying anything — including your unrelated column addition.

**Why:** These prompts are a raw stdin TTY selector, not a plain yes/no read from stdin. Piping text (`echo "No" | npm run db:push`) or a newline does not reliably select the highlighted option in this environment, so the push can appear to hang/repeat.

**How to apply:** When you only need to add a new column (or other narrow, additive change) and don't want to resolve unrelated schema drift in the same task, skip `drizzle-kit push` and apply the DDL directly via SQL (e.g. `ALTER TABLE x ADD COLUMN IF NOT EXISTS ...`) through the database execution tool. Reserve `drizzle-kit push` for when you're prepared to resolve all outstanding drift.
