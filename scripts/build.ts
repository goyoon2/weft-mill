import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMill } from "@weft/loom";

/** Build every pattern in this mill into spools + index.json. */
async function main(): Promise<void> {
  const millDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  const { index, notes } = await buildMill({
    millDir,
    generatedAt: new Date().toISOString(),
  });

  console.log(`Built ${index.entries.length} harness(es):`);
  for (const entry of index.entries) {
    const v = entry.versions[0];
    console.log(`  ${entry.id}@${entry.latest} — ${v ? v.spools.length : 0} spool(s) [${entry.clis.join(", ")}]`);
  }
  if (notes.length) {
    console.log("\nNotes:");
    for (const note of notes) console.log(`  - ${note}`);
  }
  console.log(`\nWrote ${join(millDir, "index.json")}`);

  // A captured spool that still carries a build-machine absolute path is not portable. Surface it
  // loudly, and fail the build in CI so a regression can't ship a machine-pinned artifact.
  const leaks = notes.filter((n) => n.includes("LEAK "));
  if (leaks.length) {
    console.error(`\n✖ ${leaks.length} machine-specific path leak(s) in captured spools — artifact is not portable:`);
    for (const leak of leaks) console.error(`    ${leak}`);
    if (process.env.CI) {
      process.exitCode = 1;
    } else {
      console.error("  (run under CI=1 to make this a hard failure — CI does so automatically)");
    }
  }
}

void main();
