import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndexEntry, parsePatternFile } from "@weft/loom";

/**
 * Build a SINGLE pattern into `<mill>/spools/<id>/` and persist its index entry as
 * `<mill>/spools/<id>/entry.json`. Run as an isolated child process by `build.ts` so patterns
 * build in parallel and one failure can't take the others down (the run itself is the unit of
 * failure isolation). Exits non-zero on a build error or — under CI — on a machine-path leak.
 *
 * argv[2] = the pattern file name (e.g. "gsd-core.yaml").
 */
async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error("usage: build-one <pattern-file.yaml>");

  const millDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  const pattern = parsePatternFile(join(millDir, "patterns", file));
  const { entry, notes } = await buildIndexEntry(pattern, { outDir: millDir });

  const dir = join(millDir, "spools", pattern.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "entry.json"), `${JSON.stringify(entry, null, 2)}\n`);

  for (const note of notes) console.log(note);

  const leaks = notes.filter((n) => n.includes("LEAK "));
  if (leaks.length) {
    console.error(`✖ ${pattern.id}: ${leaks.length} machine-path leak(s) — artifact is not portable.`);
    if (process.env.CI) process.exit(1);
  }
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
