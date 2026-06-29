# discovery/ — harness discovery ledger

This directory holds the **declined ledger** that the daily discovery bot
(`scripts/discover-daily.sh` → the `/discover-harnesses` command) consults so it
never wastes a run re-investigating a repo we've already rejected.

## `declined.json`

A plain JSON array of repos we have **deliberately declined** to onboard. It is
**human-editable** — add an entry by hand whenever you reject a repo (e.g. on PR
review) so the bot won't surface it again. The bot also appends to it
automatically when a candidate declines during a run; it only ever appends, so
your manual entries persist.

Entry shape:

```json
{
  "repo": "owner/name",          // GitHub repo — the dedup key
  "stars": 12345,                // star count at decline time (informational)
  "reason": "why we declined",   // archetype/runtime/rebrand/etc.
  "date": "YYYY-MM-DD"
}
```

## How it's used (the skip-set)

`/discover-harnesses` builds an "already covered" skip-set from three sources and
never re-proposes or re-recons a member:

1. **Existing catalog** — `patterns/*.yaml` (ids + `homepage:` owner/repo).
2. **In-flight PRs** — open `discover` PRs against `develop`.
3. **This ledger** — `declined.json`.

So a repo lands here either because it's non-onboardable (runtime / host-native /
degraded subset) **or** because it duplicates something we already ship (e.g. a
rebrand of a repo already in the catalog).
