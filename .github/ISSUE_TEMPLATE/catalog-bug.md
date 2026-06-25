---
name: Catalog / pattern bug
about: An existing harness installs wrong, a spool is broken, or a version is stale.
title: "catalog: "
labels: bug
---

<!--
For the catalog/data only. If the weft CLI itself misbehaves regardless of harness,
that's an engine bug — file it on weft (link shown when you start a new issue here).
-->

## Harness

- **id@version:**
- **CLI + scope:** <!-- e.g. codex / global -->

## What's wrong

- [ ] Installs the wrong / missing / extra files
- [ ] Spool missing or hash mismatch (`pnpm verify` fails)
- [ ] Catalog version is stale vs upstream (livecheck drift)
- [ ] Namespace clash with another harness / user file
- [ ] Machine-specific absolute path leaked into the catalog
- [ ] Other

## Details

<!-- Expected vs actual. Paste the relevant index.json / spool / install output. -->

## Upstream version (if stale)

<!-- The newest upstream version you see vs what the catalog currently ships. -->
