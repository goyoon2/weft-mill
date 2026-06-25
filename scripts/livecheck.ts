import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listPatternFiles, parsePatternFile, resolveUpstreamVersion } from "@weft/loom";
import type { UpstreamObservation } from "@weft/loom";

/**
 * **Livecheck** — weft's Homebrew-`brew bump --auto` analogue. Walk every pattern, observe its
 * newest *upstream* version cheaply (no rebuild — `resolveUpstreamVersion` only hits registry/API
 * metadata), and diff against the version the catalog (`index.json`) was last *built* at. Report
 * drift so a scheduled job can flag it and trigger a rebuild.
 *
 * Like Homebrew's bot this iterates the WHOLE catalog every run (the checks are cheap); it only
 * *acts* on what actually moved. It does NOT rebuild — that stays in `build.ts`, kicked by the
 * livecheck workflow on drift.
 *
 * Exit code is 0 even when harnesses are outdated (drift is normal and handled by the workflow);
 * the machine-readable signal is `$GITHUB_OUTPUT` (`outdated`, `errors`). Only an unexpected crash
 * exits non-zero.
 */

type Status = "OK" | "OUTDATED" | "NEW" | "SKIP" | "ERROR";

interface Row {
  id: string;
  catalog: string; // built version, or "—"
  upstream: string; // observed version, or "—"
  status: Status;
  note: string;
}

const millDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Map every catalog entry id → the version it was built at (`latest`). Tolerant of a missing/empty index. */
function builtVersions(): Record<string, string> {
  const path = join(millDir, "index.json");
  if (!existsSync(path)) return {};
  try {
    const index = JSON.parse(readFileSync(path, "utf8")) as { entries?: Array<{ id: string; latest: string }> };
    return Object.fromEntries((index.entries ?? []).map((e) => [e.id, e.latest]));
  } catch {
    return {};
  }
}

function classify(built: string | undefined, obs: UpstreamObservation): { status: Status; note: string } {
  if (obs.strategy === "skip") return { status: "SKIP", note: obs.skipped?.reason ?? "opted out" };
  const upstream = obs.version ?? "?";
  if (built === undefined) return { status: "NEW", note: `not in catalog · ${obs.via}` };
  if (built === upstream) return { status: "OK", note: obs.via };
  return { status: "OUTDATED", note: obs.via };
}

const STATUS_EMOJI: Record<Status, string> = {
  OK: "✅",
  OUTDATED: "⬆️",
  NEW: "🆕",
  SKIP: "⏭️",
  ERROR: "❌",
};

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function consoleTable(rows: Row[]): string {
  const head = { id: "HARNESS", catalog: "CATALOG", upstream: "UPSTREAM", status: "STATUS", note: "VIA / NOTE" };
  const all = [head, ...rows];
  const w = {
    id: Math.max(...all.map((r) => r.id.length)),
    catalog: Math.max(...all.map((r) => r.catalog.length)),
    upstream: Math.max(...all.map((r) => r.upstream.length)),
    status: Math.max(...all.map((r) => r.status.length)),
  };
  return all
    .map((r) =>
      [pad(r.id, w.id), pad(r.catalog, w.catalog), pad(r.upstream, w.upstream), pad(r.status, w.status), r.note]
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

function markdownTable(rows: Row[]): string {
  const lines = [
    "| Harness | Catalog | Upstream | Status | Via / note |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map(
      (r) => `| \`${r.id}\` | ${r.catalog} | ${r.upstream} | ${STATUS_EMOJI[r.status]} ${r.status} | ${r.note} |`,
    ),
  ];
  return lines.join("\n");
}

function setOutput(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  if (file) appendFileSync(file, `${name}=${value}\n`);
}

async function main(): Promise<void> {
  const built = builtVersions();
  const files = listPatternFiles(millDir);

  const rows: Row[] = await Promise.all(
    files.map(async (file): Promise<Row> => {
      const pattern = parsePatternFile(join(millDir, "patterns", file));
      try {
        const obs = await resolveUpstreamVersion(pattern);
        const { status, note } = classify(built[pattern.id], obs);
        return {
          id: pattern.id,
          catalog: built[pattern.id] ?? "—",
          upstream: obs.version ?? "—",
          status,
          note,
        };
      } catch (err) {
        return {
          id: pattern.id,
          catalog: built[pattern.id] ?? "—",
          upstream: "—",
          status: "ERROR",
          note: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
  rows.sort((a, b) => a.id.localeCompare(b.id));

  const outdated = rows.filter((r) => r.status === "OUTDATED");
  const fresh = rows.filter((r) => r.status === "NEW");
  const errors = rows.filter((r) => r.status === "ERROR");
  const actionable = [...outdated, ...fresh];

  // ── human console output ──
  console.log(consoleTable(rows));
  console.log(
    `\n${rows.length} harness(es): ${outdated.length} outdated, ${fresh.length} new, ${errors.length} error(s).`,
  );

  // ── markdown report (issue body + job summary) ──
  const titleLine = actionable.length
    ? `**${actionable.length} harness(es) need a rebuild** (${outdated.length} outdated, ${fresh.length} new).`
    : "All harnesses are up to date with upstream. ✅";
  const body = [
    "## weft livecheck",
    "",
    titleLine,
    errors.length ? `\n> ⚠️ ${errors.length} harness(es) could not be checked — see the ❌ rows below.` : "",
    "",
    markdownTable(rows),
    "",
    "<sub>Generated by `weft-mill` livecheck — compares each pattern's upstream version against the built catalog.</sub>",
  ].join("\n");
  writeFileSync(join(millDir, "livecheck-report.md"), `${body}\n`);

  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) appendFileSync(summaryFile, `${body}\n`);

  // ── machine-readable outputs for the workflow ──
  setOutput("outdated", String(actionable.length > 0));
  setOutput("errors", String(errors.length > 0));
  setOutput("count", String(actionable.length));
  setOutput("ids", actionable.map((r) => r.id).join(","));
  // Structured drift records the bump workflow consumes to rebuild + open one PR per harness.
  setOutput(
    "bumps",
    JSON.stringify(
      actionable.map((r) => ({
        id: r.id,
        from: r.catalog === "—" ? null : r.catalog,
        to: r.upstream,
        via: r.note,
        status: r.status,
      })),
    ),
  );
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
});
