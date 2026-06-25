import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { absolutizeSpoolUrl, parseIndex, sha256OfFile } from "@weft/schema";

/**
 * Cheap integrity gate for the committed catalog (no upstream installer re-run): parse index.json,
 * and for every spool it references confirm the .tgz is present on disk and its sha256 matches the
 * recorded `spoolSha`. Run on PRs that touch index.json / spools, so a bump PR can't merge with a
 * dangling or tampered spool. Exits non-zero on any problem.
 */
async function main(): Promise<void> {
  const millDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  const index = parseIndex(JSON.parse(readFileSync(join(millDir, "index.json"), "utf8")));

  let checked = 0;
  const problems: string[] = [];
  for (const e of index.entries) {
    for (const v of e.versions) {
      for (const s of v.spools) {
        const where = `${e.id} ${v.version} ${s.cli}/${s.scope}`;
        const url = absolutizeSpoolUrl(s.url, millDir);
        if (!url.startsWith("file://")) {
          problems.push(`${where}: non-local spool url (${s.url})`);
          continue;
        }
        const path = fileURLToPath(url);
        if (!existsSync(path)) {
          problems.push(`${where}: spool not found (${s.url})`);
          continue;
        }
        const sha = await sha256OfFile(path);
        if (sha !== s.spoolSha) {
          problems.push(`${where}: sha mismatch\n    expected ${s.spoolSha}\n    got      ${sha}`);
          continue;
        }
        checked++;
      }
    }
  }

  if (problems.length) {
    console.error(`✖ verify-catalog: ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`✓ verify-catalog: ${index.entries.length} harness(es), ${checked} spool(s) present and hashes match.`);
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
