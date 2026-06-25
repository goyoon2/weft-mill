<!--
Automated catalog bumps (from bump.yml) fill this in themselves with a consistent body — leave it as
is when reviewing one. For a HUMAN PR (a new/edited pattern, a script or workflow change), fill in
the sections below.
-->

## Summary

<!-- What changed and why. -->

## Type of change

- [ ] New / edited harness pattern (`patterns/*.yaml`)
- [ ] Build / livecheck / workflow change (`scripts/`, `.github/`)
- [ ] Catalog bump (`index.json` + spools) — usually automated

## Checklist

- [ ] `pnpm build` succeeds locally (or CI build-catalog is green)
- [ ] `pnpm verify` passes (spools present, hashes match)
- [ ] index.json diff is scoped to the intended harness(es) — no unrelated churn
- [ ] No machine-specific absolute paths leaked into the catalog
