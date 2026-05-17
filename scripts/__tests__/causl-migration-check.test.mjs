/**
 * Tests for scripts/causl-migration-check.mjs.
 *
 * The wrapper around `@causl/migration-check` is the contract that
 * closes issue #101: it broadens the scope to the full `packages/`
 * tree, subtracts a hand-reviewed baseline of false positives, and
 * fails the build on drift (new findings) or stale baseline entries.
 *
 * The script ALSO supports `--update-baseline` for the maintenance
 * path. We do not test that here — `--update-baseline` writes to the
 * real `causl-migration-baseline.json` file at the repo root, and
 * intercepting that for a test would require spinning up a temp repo,
 * which is overkill for a wrapper this small. The maintenance flag is
 * documented in the script header and exercised manually when entries
 * drift.
 *
 * Test runner: node --test, invoked via `pnpm test:scripts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const scriptPath = resolve(repoRoot, 'scripts', 'causl-migration-check.mjs');

test('wrapper exits 0 when the live findings match the baseline', () => {
  // This is the green path — the committed baseline tracks the 73 known
  // local-UI-state false positives. If a future commit lifts a baselined
  // site into the causl graph (or shifts its line number by more than
  // ±2), the wrapper exits 1 and this assertion will catch it.
  const result = spawnSync('node', [scriptPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    // The wrapper writes its banner to stderr and only emits JSON on
    // stdout when `--json` is passed. Captureboth so failure messages
    // are visible in CI logs.
  });
  assert.equal(
    result.status,
    0,
    `wrapper exited ${result.status} (expected 0)\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  assert.match(result.stderr, /0 new findings/);
});

test('--json flag prints a DriftReport-shaped JSON document', () => {
  // The dashboard contract: when `--json` is passed, stdout is a single
  // JSON document with `schema`, `catalogueVersion`, `stats`, and
  // `findings`. The wrapper subtracts the baseline before emitting, so
  // the `findings` array reflects only the NEW drift.
  const result = spawnSync('node', [scriptPath, '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    `wrapper exited ${result.status} (expected 0)\nstderr:\n${result.stderr}`,
  );
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.schema, 'expected `schema` field on DriftReport');
  assert.ok(parsed.catalogueVersion, 'expected `catalogueVersion` field on DriftReport');
  assert.ok(parsed.stats, 'expected `stats` field on DriftReport');
  assert.ok(Array.isArray(parsed.findings), 'expected `findings` array on DriftReport');
  // The green-path baseline absorbs everything, so the filtered view
  // should be empty.
  assert.equal(parsed.findings.length, 0, `expected 0 new findings, got ${parsed.findings.length}`);
});
