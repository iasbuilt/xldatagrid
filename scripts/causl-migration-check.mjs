#!/usr/bin/env node
// Wrapper around `@causl/migration-check` that:
//   1. scans the full `packages/` tree (not just `packages/core`), so future
//      Jotai-pattern regressions in `packages/react` and `packages/mui` get
//      caught instead of slipping past a narrowed scope;
//   2. subtracts a hand-reviewed baseline of known *local UI state* false
//      positives (see `scripts/causl-migration-baseline.json`). The
//      upstream rules S-01/S-04/S-06/S-07 cannot distinguish local
//      `useState` (cell-editor drafts, hover state, menu open/closed) from
//      shared state that should live in the causl graph — the baseline is
//      the curated list of sites where the human reviewer asserts the
//      finding is local-only.
//
// Exit codes:
//   0 — every live finding is covered by the baseline AND no baseline
//       entry has gone stale (every baseline entry still matches a live
//       finding within ±2 lines of the recorded line). This is the green
//       path that closes #101.
//   1 — new finding(s) not present in the baseline, OR stale baseline
//       entries that no longer match any live finding. Stderr lists each
//       category with file:line:ruleId so the reviewer can either fix the
//       drift or update the baseline.
//   2 — fatal error invoking the underlying CLI.
//
// Flags:
//   --update-baseline   rewrite `scripts/causl-migration-baseline.json`
//                       from the current live report. Use sparingly and
//                       only after eyeballing every entry; the baseline
//                       is the contract that future drift gets caught.
//   --json              emit the filtered DriftReport to stdout (the
//                       baseline-subtracted view). Useful for dashboards.
//
// The wrapper assumes it is run from the repository root (the same place
// `pnpm lint:migration` runs from). It shells out to the underlying CLI
// rather than importing `scanDirectory` directly so that any future
// CLI-only flags (e.g. extension overrides) carry through transparently.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const BASELINE_PATH = resolve(__dirname, 'causl-migration-baseline.json')
const TARGET = resolve(REPO_ROOT, 'packages')

const args = new Set(process.argv.slice(2))
const updateBaseline = args.has('--update-baseline')
const emitJson = args.has('--json')

/** Run the upstream CLI and parse its JSON report. */
function runCheck() {
  let stdout
  try {
    stdout = execFileSync(
      'pnpm',
      ['exec', 'causl-migration-check', TARGET],
      {
        cwd: REPO_ROOT,
        // The CLI exits non-zero when critical findings exist. That is
        // expected here (we know there are 73), so we capture stdout
        // regardless and let the exit code fall through.
        stdio: ['ignore', 'pipe', 'inherit'],
        maxBuffer: 64 * 1024 * 1024,
      },
    )
  } catch (err) {
    // execFileSync throws on non-zero exit; the stdout we want is on err.
    if (err && err.stdout) {
      stdout = err.stdout
    } else {
      process.stderr.write(`causl-migration-check wrapper: failed to invoke CLI\n`)
      process.exit(2)
    }
  }
  try {
    return JSON.parse(stdout.toString('utf8'))
  } catch {
    process.stderr.write(`causl-migration-check wrapper: CLI output was not valid JSON\n`)
    process.exit(2)
  }
}

function loadBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  } catch (err) {
    process.stderr.write(`causl-migration-check wrapper: cannot read ${BASELINE_PATH}: ${err.message}\n`)
    process.exit(2)
  }
}

/** Match within a small line window to absorb whitespace-only edits. */
const LINE_WINDOW = 2

function matchesBaselineEntry(finding, entry) {
  return (
    finding.ruleId === entry.ruleId &&
    finding.file === entry.file &&
    Math.abs(finding.line - entry.line) <= LINE_WINDOW
  )
}

function diffFindingsAgainstBaseline(findings, baselineEntries) {
  const baselineUsed = new Array(baselineEntries.length).fill(false)
  const newFindings = []
  for (const finding of findings) {
    const idx = baselineEntries.findIndex(
      (entry, i) => !baselineUsed[i] && matchesBaselineEntry(finding, entry),
    )
    if (idx === -1) {
      newFindings.push(finding)
    } else {
      baselineUsed[idx] = true
    }
  }
  const stale = baselineEntries.filter((_, i) => !baselineUsed[i])
  return { newFindings, stale }
}

function summarizeFindings(findings) {
  return findings
    .map((f) => `  - [${f.ruleId}] ${f.file}:${f.line}:${f.column} — ${f.token}`)
    .join('\n')
}

function summarizeBaselineEntries(entries) {
  return entries
    .map((e) => `  - [${e.ruleId}] ${e.file}:${e.line}`)
    .join('\n')
}

const report = runCheck()
const baseline = loadBaseline()

if (updateBaseline) {
  const fresh = {
    description: baseline.description,
    count: report.findings.length,
    findings: report.findings.map((f) => ({
      ruleId: f.ruleId,
      file: f.file,
      line: f.line,
      column: f.column,
    })),
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(fresh, null, 2) + '\n', 'utf8')
  process.stderr.write(
    `causl-migration-check wrapper: baseline rewritten with ${fresh.count} findings.\n`,
  )
  process.exit(0)
}

const { newFindings, stale } = diffFindingsAgainstBaseline(
  report.findings,
  baseline.findings,
)

if (emitJson) {
  process.stdout.write(
    JSON.stringify(
      {
        ...report,
        stats: {
          ...report.stats,
          findings: newFindings.length,
        },
        findings: newFindings,
      },
      null,
      2,
    ) + '\n',
  )
}

if (newFindings.length === 0 && stale.length === 0) {
  if (!emitJson) {
    process.stderr.write(
      `causl-migration-check: 0 new findings, baseline of ${baseline.findings.length} entries fully consumed.\n`,
    )
  }
  process.exit(0)
}

if (newFindings.length > 0) {
  process.stderr.write(`\ncausl-migration-check: ${newFindings.length} new finding(s) not in baseline:\n`)
  process.stderr.write(summarizeFindings(newFindings) + '\n')
}

if (stale.length > 0) {
  process.stderr.write(
    `\ncausl-migration-check: ${stale.length} stale baseline entry(ies) — the underlying code has changed and the finding no longer fires.\n`,
  )
  process.stderr.write(summarizeBaselineEntries(stale) + '\n')
  process.stderr.write(
    `\nRefresh the baseline with: node scripts/causl-migration-check.mjs --update-baseline\n`,
  )
}

process.exit(1)
