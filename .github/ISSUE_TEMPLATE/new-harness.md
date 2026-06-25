---
name: New harness
about: Request that a repo / package be onboarded into the catalog as a pattern.
title: "harness: <name>"
labels: new-harness
---

<!--
This becomes a `patterns/<id>.yaml`. Fill in what you know — the rest is decided while
authoring the pattern (see the weft-pattern-author flow). The more of the source below
you can answer, the faster it lands.
-->

## What is it

- **Name:**
- **Proposed id:** <!-- kebab-case, e.g. gsd-core, mattpocock-skills -->
- **Homepage / repo:**
- **What it provides:** <!-- skills / agents / commands / hooks / mcp — which? -->

## Source

- **Type:** <!-- npm package / git repo -->
- **npm package or git URL:**
- **Has its own installer?** <!-- yes = likely `captured` (run it in a sandbox, snapshot output);
                                  no  = likely `declarative` (map files directly) -->

## CLIs

<!-- Which AI CLIs does it support / should we build spools for? -->

- [ ] claude-code
- [ ] codex
- [ ] gemini
- [ ] opencode
- [ ] cursor

## Versioning

- **Strategy:** <!-- semver / latest dist-tag / git tags -->
- **Livecheck source:** <!-- npm `latest`, a `v*` tag pattern, etc. — or "opt out" + reason -->

## Notes

<!--
Anything that affects authoring:
- are artifact names self-prefixed (like gsd-*) or bare (collision-prone)?
- license / permission to redistribute?
- known per-CLI quirks (different config dirs per scope, content rewrites at install, ...)?
-->
