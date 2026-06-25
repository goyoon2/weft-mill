# weft-mill

The **mill** — weft's harness registry (the Homebrew-core analogue).

- `patterns/<id>.yaml` — human-authored harness **patterns** (source of truth; the formula analogue).
- `index.json` — generated catalog that `weft update` downloads.
- `spools/` — generated, normalized, ready-to-merge **spools** per `(harness, version, cli, scope)`
  (the bottle analogue). Build output; not committed.

## Build

```sh
pnpm install          # links @weft/loom + @weft/schema from the sibling weft repo
pnpm build            # patterns/*.yaml -> spools/ + index.json
```

Spools are hosted locally (`file://`) during the vertical slice; a CDN / GitHub Release
host comes later.
