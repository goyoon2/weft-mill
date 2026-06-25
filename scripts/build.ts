import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listPatternFiles, parsePatternFile } from "@weft/loom";
import type { Index, IndexEntry } from "@weft/schema";

/**
 * Incremental, parallel mill build.
 *
 * - **B (incremental):** each pattern's yaml is hashed and compared to the prior build state in
 *   `spools/.build-state.json` (persisted across CI runs via the GitHub Actions cache of `spools/`).
 *   Only patterns whose yaml changed — or whose cached spools are missing — are rebuilt; the rest
 *   are reused from cache. `WEFT_BUILD_ALL=1` forces a full rebuild (for upstream-version drift on
 *   `track: latest`, run on a schedule / manual dispatch).
 * - **C (parallel):** rebuilds run as isolated `build-one.ts` child processes, capped at
 *   WEFT_BUILD_CONCURRENCY (default 4) — real parallelism despite the synchronous capture exec.
 * - **F (failure isolation):** one pattern failing doesn't abort the others; all failures are
 *   collected and reported, and the build exits non-zero at the end (so CI is red) while still
 *   assembling an index for everything that succeeded.
 */
const millDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const spoolsDir = join(millDir, "spools");
const statePath = join(spoolsDir, ".build-state.json");
const tsxBin = (() => {
  const local = join(millDir, "node_modules", ".bin", "tsx");
  return existsSync(local) ? local : "tsx";
})();

const CONCURRENCY = Math.max(1, Number(process.env.WEFT_BUILD_CONCURRENCY) || 4);
const FORCE_ALL = process.env.WEFT_BUILD_ALL === "1";

type BuildState = Record<string, { yamlSha: string }>;
const sha256 = (buf: Buffer | string): string => createHash("sha256").update(buf).digest("hex");

function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function entryFile(id: string): string {
  return join(spoolsDir, id, "entry.json");
}

/** A cached entry is only reusable if every spool .tgz it references is actually still on disk. */
function spoolsPresent(entry: IndexEntry): boolean {
  return entry.versions.every((v) =>
    v.spools.every((s) => {
      try {
        return existsSync(fileURLToPath(s.url));
      } catch {
        return false;
      }
    }),
  );
}

interface ChildResult {
  file: string;
  id: string;
  code: number;
  output: string;
}

function buildOne(file: string, id: string): Promise<ChildResult> {
  return new Promise((resolve) => {
    const child = spawn(tsxBin, [join(millDir, "scripts", "build-one.ts"), file], {
      cwd: millDir,
      env: process.env,
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));
    child.on("close", (code) => resolve({ file, id, code: code ?? 1, output }));
    child.on("error", (err) => resolve({ file, id, code: 1, output: `${output}\n${String(err)}` }));
  });
}

async function runPool(tasks: { file: string; id: string }[]): Promise<ChildResult[]> {
  const results: ChildResult[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < tasks.length) {
      const task = tasks[next++]!;
      results.push(await buildOne(task.file, task.id));
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));
  return results;
}

async function main(): Promise<void> {
  const files = listPatternFiles(millDir);
  const prior = readJson<BuildState>(statePath) ?? {};

  // ── classify every current pattern: reuse from cache, or rebuild ──
  const current: { file: string; id: string; yamlSha: string }[] = [];
  const toBuild: { file: string; id: string }[] = [];
  for (const file of files) {
    const yamlSha = sha256(readFileSync(join(millDir, "patterns", file)));
    const pattern = parsePatternFile(join(millDir, "patterns", file));
    const id = pattern.id;
    current.push({ file, id, yamlSha });

    const cachedEntry = readJson<IndexEntry>(entryFile(id));
    const reusable =
      !FORCE_ALL && prior[id]?.yamlSha === yamlSha && cachedEntry !== undefined && spoolsPresent(cachedEntry);
    if (!reusable) toBuild.push({ file, id });
  }

  const currentIds = new Set(current.map((c) => c.id));
  const reused = current.filter((c) => !toBuild.some((t) => t.id === c.id));
  console.log(
    `${files.length} pattern(s): ${toBuild.length} to build, ${reused.length} reused from cache` +
      `${FORCE_ALL ? " (WEFT_BUILD_ALL — full rebuild)" : ""}`,
  );

  // ── prune cached spools for patterns that no longer exist ──
  const cachedIds = existsSync(spoolsDir)
    ? readdirSync(spoolsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];
  for (const id of cachedIds) {
    if (!currentIds.has(id)) {
      rmSync(join(spoolsDir, id), { recursive: true, force: true });
      console.log(`  pruned removed pattern: ${id}`);
    }
  }

  // ── build the changed ones in parallel ──
  const built = await runPool(toBuild);
  for (const r of built) {
    if (r.output.trim()) console.log(`\n── ${r.id} ──\n${r.output.trim()}`);
  }
  const failures = built.filter((r) => r.code !== 0);
  const failedIds = new Set(failures.map((f) => f.id));

  // ── assemble index.json from every current pattern's entry (reused + freshly built) ──
  const entries: IndexEntry[] = [];
  const missing: string[] = [];
  for (const { id } of current) {
    const entry = readJson<IndexEntry>(entryFile(id));
    if (entry) entries.push(entry);
    else missing.push(id);
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));

  const index: Index = { schema: 1, generatedAt: new Date().toISOString(), entries };
  writeFileSync(join(millDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`);

  // ── persist build state for the next incremental run ──
  // Skip failed patterns so they're RETRIED next run (recording their new yaml-hash would poison
  // the cache into thinking the failed build is up to date).
  const nextState: BuildState = {};
  for (const { id, yamlSha } of current) {
    if (!failedIds.has(id)) nextState[id] = { yamlSha };
  }
  mkdirSync(spoolsDir, { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`);

  console.log(`\nWrote ${join(millDir, "index.json")} — ${entries.length} harness(es).`);

  if (failures.length) {
    console.error(`\n✖ ${failures.length} pattern(s) failed to build: ${failures.map((f) => f.id).join(", ")}`);
  }
  // A current pattern with no entry means its (re)build failed and it's absent from the catalog.
  const unexplainedMissing = missing.filter((id) => !failedIds.has(id));
  if (unexplainedMissing.length) {
    console.error(`✖ no entry produced for: ${unexplainedMissing.join(", ")}`);
  }
  if (failures.length || missing.length) process.exitCode = 1;
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
});
